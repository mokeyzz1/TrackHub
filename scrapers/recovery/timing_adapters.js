/**
 * Read-only adapters for timing platforms that publish relay results outside TFRRS and
 * AthleticLIVE. Each adapter returns the same small source-row shape; the shared ingestion
 * contract remains responsible for event mapping, mark parsing, identity resolution, and
 * duplicate protection.
 *
 * Supported formats:
 *   - MileSplit Live: public Firestore documents
 *   - PT Timing / Leone Timing: public Karmarush Firebase Realtime Database documents
 *
 * Blue Ridge Timing is an AthleticLIVE tenant, so it deliberately does not get a third parser.
 */

const { URL } = require('url');

const FOUR_BY_100 = '4x100m';
const DEFAULT_TIMEOUT_MS = 30000;

const KARMARUSH_CONFIG = Object.freeze({
  pt_timing: Object.freeze({
    hosts: ['pttiming.com'],
    firebaseHost: 'ptt-franklin.firebaseio.com',
    pageHosts: ['live.pttiming.com', 'pttiming.com']
  }),
  leonetiming: Object.freeze({
    hosts: ['leonetiming.com'],
    firebaseHost: 'franklin-f56f3.firebaseio.com',
    pageHosts: ['results.leonetiming.com', 'leonetiming.com']
  })
});

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize('NFKC').trim();
  return normalized || null;
}

function normalizeEventText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\u00d7/g, 'x')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Match 4x100, 4x100m, 4x100 Meter Relay, etc., but never 4x100 shuttle. */
function isFourBy100(value) {
  const normalized = normalizeEventText(value);
  if (!normalized || /shuttle/.test(normalized)) return false;
  return /(?:^|\s)4\s*x\s*100(?:\s*m(?:eter)?s?)?(?:\s*relay)?(?:\s*race)?(?:$|\s)/.test(normalized);
}

function genderCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (['F', 'W', 'WOMEN', 'WOMEN\'S', 'GIRLS'].includes(normalized)) return 'F';
  if (['M', 'MEN', 'MEN\'S', 'BOYS'].includes(normalized)) return 'M';
  return null;
}

function normalizeRound(value) {
  if (value === null || value === undefined || value === '') return 'Finals';
  if (typeof value === 'object') return text(value.name || value.label || value.code) || 'Finals';
  const raw = String(value).trim();
  if (/^f(?:inal)?s?$/i.test(raw)) return 'Finals';
  if (/^p(?:relim(?:inary|inaries)?)?$/i.test(raw)) return 'Preliminaries';
  return raw || 'Finals';
}

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== '') ?? null;
}

function statusMark(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  const aliases = {
    D: 'DNF',
    Q: 'DQ',
    S: 'SCR',
    SCRATCH: 'SCR',
    SCRATCHED: 'SCR'
  };
  return aliases[normalized] || normalized;
}

function resultMark(entry) {
  const mark = firstValue(entry?.M, entry?.mark, entry?.result, entry?.time);
  if (mark && typeof mark !== 'object') return text(mark);

  for (const key of ['DQ', 'DNS', 'DNF', 'FS', 'SCR', 'status', 'Status', 'resultStatus']) {
    const value = entry?.[key];
    if (value === true && key !== 'status' && key !== 'Status') return statusMark(key);
    if (value && key.toLowerCase().includes('status')) return statusMark(value);
  }
  return null;
}

function stableSourceKey(value, fallback) {
  return text(value) || text(fallback);
}

function athleteName(value) {
  if (!value) return null;
  if (typeof value === 'string') return text(value);
  return text(firstValue(
    value.N,
    value.name,
    [value.firstName || value.FN, value.lastName || value.LN].filter(Boolean).join(' ')
  ));
}

function relayLegsFromKarmarush(rrd, sourceMeetId, eventKey, entryKey) {
  const values = Array.isArray(rrd) ? rrd : Object.values(rrd || {});
  const legs = [];
  const seenOrders = new Set();
  values.forEach((rawLeg, index) => {
    if (!rawLeg || typeof rawLeg !== 'object') return;
    const legOrder = positiveInteger(firstValue(rawLeg.L, rawLeg.leg, rawLeg.legNumber, index));
    // RRD contains alternates in many Karmarush meets. A 4x100 race has four race legs; keeping
    // alternates as race legs would corrupt lineups and make cross-source matching unsafe.
    if (!legOrder || legOrder > 4 || seenOrders.has(legOrder)) return;
    const athlete = rawLeg.A || rawLeg.athlete || rawLeg;
    const name = athleteName(athlete);
    if (!name) return;
    seenOrders.add(legOrder);
    const athleteId = firstValue(athlete.ID, athlete.id, rawLeg.AID, rawLeg.athleteId);
    legs.push({
      leg_order: legOrder,
      athlete_name: name,
      source_athlete_key: stableSourceKey(
        athleteId,
        `${sourceMeetId}|event=${eventKey}|entry=${entryKey}|leg=${legOrder}|name=${name}`
      ),
      source_athlete_id: text(athleteId)
    });
  });
  return legs.sort((a, b) => a.leg_order - b.leg_order);
}

function karmarushEventIs4x100(event) {
  return isFourBy100(event?.E?.ID)
    || isFourBy100(event?.E?.N)
    || isFourBy100(event?.E?.SC)
    || isFourBy100(event?.name);
}

function parseKarmarushRows({ source, sourceMeetId, sourceUrl, meta = {}, meetEvents = {}, targetMeetId }) {
  const rows = [];
  for (const [eventKey, event] of Object.entries(meetEvents || {})) {
    if (!event || !karmarushEventIs4x100(event)) continue;
    const entries = event.ED && typeof event.ED === 'object' ? event.ED : {};
    for (const [entryKey, entry] of Object.entries(entries)) {
      if (!entry || typeof entry !== 'object') continue;
      const markRaw = resultMark(entry);
      if (!markRaw) continue;

      const teamName = text(firstValue(entry.TN, entry.teamName, entry.TC, entry.teamCode));
      const teamKey = stableSourceKey(entry.TID, firstValue(entry.TC, teamName));
      const gender = genderCode(firstValue(entry.G, event.G, event.gender));
      const eventName = text(firstValue(event.E?.N, event.E?.ID, FOUR_BY_100)) || FOUR_BY_100;
      const eventRound = event.RN || event.round || event.R || 'Finals';
      const sourceRecordKey = `${sourceMeetId}|event=${eventKey}|entry=${entryKey}`;

      rows.push({
        source,
        target_meet_id: targetMeetId,
        meet_id: targetMeetId,
        source_meet_key: String(sourceMeetId),
        source_event_key: String(eventKey),
        source_record_key: sourceRecordKey,
        source_url: sourceUrl,
        event_id: firstValue(event.E?.ID, event.ID, eventKey),
        event_name: FOUR_BY_100,
        source_event_name: eventName,
        team_name: teamName,
        source_team_name: teamName,
        source_team_key: teamKey,
        team_gender: gender,
        mark_raw: markRaw,
        place: positiveInteger(firstValue(entry.P, entry.place, entry.HP)),
        round: normalizeRound(eventRound),
        date: firstValue(meta.startDate, meta.date, meta.start_date),
        meet_name: text(firstValue(meta.name, meta.meetName)),
        is_relay: true,
        relay_athletes: relayLegsFromKarmarush(entry.RRD, sourceMeetId, eventKey, entryKey),
        source_payload: { eventKey, entryKey, event, entry }
      });
    }
  }
  return rows;
}

function decodeFirestoreValue(value) {
  if (value === null || value === undefined) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'referenceValue')) return value.referenceValue;
  if (Object.prototype.hasOwnProperty.call(value, 'bytesValue')) return value.bytesValue;
  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) {
    return decodeFirestoreFields(value.mapValue.fields || {});
  }
  return value;
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function documentId(documentName) {
  return String(documentName || '').split('/').pop() || null;
}

function decodeFirestoreDocument(document) {
  return {
    ...(decodeFirestoreFields(document?.fields || {})),
    id: documentId(document?.name)
  };
}

function firestoreEventRound(event, entry) {
  const code = firstValue(entry?.round, entry?.roundCode, entry?.R);
  const rounds = event?.rounds || {};
  const round = code == null ? null : rounds[String(code)] || rounds[code];
  return normalizeRound(round?.name || round?.label || code || 'Finals');
}

function firestoreGender(event) {
  return genderCode(firstValue(event?.gender?.fields?.sex, event?.gender?.sex, event?.gender?.code, event?.gender));
}

function firestoreRelayLegs(relay, sourceMeetId, eventKey, entryKey) {
  const legValues = relay?.legs && typeof relay.legs === 'object' ? Object.values(relay.legs) : [];
  return legValues
    .map((leg, index) => ({ leg, index }))
    .map(({ leg, index }) => ({
      leg_order: positiveInteger(firstValue(leg?.legNumber, leg?.leg, index + 1)),
      athlete_name: athleteName(leg),
      source_athlete_key: stableSourceKey(
        firstValue(leg?.mileSplitId, leg?.milesplitId, leg?.id, leg?.athleteId),
        `${sourceMeetId}|event=${eventKey}|entry=${entryKey}|leg=${index + 1}|name=${athleteName(leg)}`
      ),
      source_athlete_id: text(firstValue(leg?.mileSplitId, leg?.milesplitId, leg?.id, leg?.athleteId))
    }))
    .filter(leg => leg.leg_order && leg.leg_order <= 4 && leg.athlete_name)
    .sort((a, b) => a.leg_order - b.leg_order);
}

function parseMileSplitRows({ meetId, sourceUrl, meet, events = [], entries = [], targetMeetId }) {
  const eventMap = new Map(events
    .filter(event => isFourBy100(event.code) || isFourBy100(event.name))
    .map(event => [String(firstValue(event.id, event.eventId)), event]));
  const rows = [];
  for (const entry of entries || []) {
    const eventKey = String(entry?.event ?? entry?.eventId ?? '');
    const event = eventMap.get(eventKey);
    const relay = entry?.relay;
    if (!event || !relay) continue;
    const result = entry.result || {};
    const markRaw = text(firstValue(result.text, result.mark, result.time, result.status));
    if (!markRaw) continue;
    const eventId = String(firstValue(event.id, event.eventId, eventKey));
    const entryId = String(firstValue(entry.id, `${eventId}_${entry.round || 'F'}_${relay.id || relay.letter || 'entry'}`));
    const team = relay.team || {};
    const teamName = text(firstValue(team.name, team.abbreviation));
    const teamKey = stableSourceKey(relay.id, firstValue(team.id, team.abbreviation, teamName));
    const sourceRecordKey = `${meetId}|event=${eventId}|entry=${entryId}`;

    rows.push({
      source: 'milesplit',
      target_meet_id: targetMeetId,
      meet_id: targetMeetId,
      source_meet_key: String(meetId),
      source_event_key: eventId,
      source_record_key: sourceRecordKey,
      source_url: sourceUrl,
      event_id: eventId,
      event_name: FOUR_BY_100,
      source_event_name: text(firstValue(event.name, event.code)),
      team_name: teamName,
      source_team_name: teamName,
      source_team_key: teamKey,
      team_gender: firestoreGender(event),
      mark_raw: markRaw,
      place: positiveInteger(firstValue(result.place, result.P)),
      round: firestoreEventRound(event, entry),
      date: firstValue(meet.dateStart, meet.date, meet.startDate),
      meet_name: text(firstValue(meet.name, meet.title)),
      is_relay: true,
      relay_athletes: firestoreRelayLegs(relay, meetId, eventId, entryId),
      source_payload: { event, entry }
    });
  }
  return rows;
}

function parseJsonResponseBody(response, url) {
  if (!response.ok) throw new Error(`source HTTP ${response.status}: ${url}`);
  return response.json().catch(() => { throw new Error(`source returned invalid JSON: ${url}`); });
}

async function getJson(url, { fetchImpl = global.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('a fetch implementation is required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    return await parseJsonResponseBody(response, url);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`source request timed out: ${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getText(url, { fetchImpl = global.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('a fetch implementation is required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { accept: 'text/html' }, signal: controller.signal });
    if (!response.ok) throw new Error(`source HTTP ${response.status}: ${url}`);
    return response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`source request timed out: ${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseMileSplitUrl(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || !['milesplit.live', 'www.milesplit.live', 'milesplit.com', 'www.milesplit.com'].includes(url.hostname.toLowerCase())) {
    throw new Error(`unsupported MileSplit URL: ${sourceUrl}`);
  }
  const match = url.pathname.match(/\/meets\/(\d+)/i);
  const timerMatch = url.pathname.match(/\/timers\/(\d+)/i);
  if (!match && !timerMatch) throw new Error(`MileSplit URL must identify /meets/<id> or /timers/<id>: ${sourceUrl}`);
  return {
    url: url.toString(),
    meetId: match?.[1] || null,
    timerId: timerMatch?.[1] || null
  };
}

async function listFirestoreDocuments(baseUrl, collection, options = {}) {
  const documents = [];
  let pageToken = null;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${baseUrl}/documents/${collection}`);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await getJson(url.toString(), options);
    documents.push(...(response.documents || []).map(decodeFirestoreDocument));
    pageToken = response.nextPageToken || null;
    if (!pageToken) return documents;
  }
  throw new Error(`Firestore collection pagination exceeded safety limit: ${collection}`);
}

async function postJson(url, body, { fetchImpl = global.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('a fetch implementation is required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return await parseJsonResponseBody(response, url);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`source request timed out: ${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function listMileSplitTimerMeets(baseUrl, timerId, options = {}) {
  const response = await postJson(`${baseUrl}/documents:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: 'meets' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'timingCompany.mileSplitId' },
          op: 'EQUAL',
          value: { integerValue: String(timerId) }
        }
      },
      orderBy: [{ field: { fieldPath: 'lastUpdated' }, direction: 'DESCENDING' }],
      limit: 75
    }
  }, options);
  return (Array.isArray(response) ? response : [])
    .filter(row => row?.document)
    .map(row => decodeFirestoreDocument(row.document));
}

function sourceDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizedMeetName(value) {
  return normalizeEventText(value).replace(/\b(?:meet|invitational|invite)\b/g, '').replace(/\s+/g, ' ').trim();
}

/** Resolve a generic MileSplit timer listing without guessing across same-day meets. */
function selectMileSplitTimerMeet(candidates, targetMeet) {
  const targetDate = sourceDateKey(targetMeet?.date);
  const targetName = normalizedMeetName(targetMeet?.name);
  const dateMatches = (candidates || []).filter(candidate => {
    const start = sourceDateKey(candidate.dateStart || candidate.startDate || candidate.date);
    const end = sourceDateKey(candidate.dateEnd || candidate.endDate);
    return targetDate && (start === targetDate || end === targetDate);
  });
  const nameMatches = dateMatches.filter(candidate => normalizedMeetName(candidate.name) === targetName);
  if (nameMatches.length === 1) return nameMatches[0];
  if (nameMatches.length > 1) throw new Error('source_timer_match_ambiguous: multiple MileSplit meets share the same name and date');
  if (dateMatches.length === 1) return dateMatches[0];
  if (!dateMatches.length) throw new Error('source_timer_no_matching_meet: MileSplit timer has no meet on the canonical date');
  throw new Error('source_timer_match_ambiguous: multiple MileSplit meets share the canonical date');
}

async function fetchMileSplitRows({ sourceUrl, targetMeetId, targetMeet, fetchImpl, timeoutMs } = {}) {
  const parsed = parseMileSplitUrl(sourceUrl);
  const base = `https://firestore.googleapis.com/v1/projects/milesplit-live-results/databases/%28default%29`;
  const options = { fetchImpl, timeoutMs };
  let sourceMeetId = parsed.meetId;
  let timerCandidates = [];
  if (!sourceMeetId) {
    if (!targetMeet) throw new Error('target meet metadata is required to resolve a MileSplit timer URL');
    timerCandidates = await listMileSplitTimerMeets(base, parsed.timerId, options);
    const selected = selectMileSplitTimerMeet(timerCandidates, targetMeet);
    sourceMeetId = String(firstValue(selected.mileSplitId, selected.id));
    if (!sourceMeetId) throw new Error('source_timer_missing_meet_id: MileSplit timer result has no meet ID');
  }
  const meet = decodeFirestoreDocument(await getJson(`${base}/documents/meets/${sourceMeetId}`, options));
  const [events, entries] = await Promise.all([
    listFirestoreDocuments(base, `meets/${sourceMeetId}/events`, options),
    listFirestoreDocuments(base, `meets/${sourceMeetId}/entries`, options)
  ]);
  return {
    source: 'milesplit',
    sourceMeetId,
    sourceUrl: parsed.url,
    resolvedSourceUrl: `https://milesplit.live/meets/${sourceMeetId}`,
    meet,
    events,
    entries,
    timerCandidates,
    rows: parseMileSplitRows({ meetId: sourceMeetId, sourceUrl: parsed.url, meet, events, entries, targetMeetId })
  };
}

function parseKarmarushUrl(source, sourceUrl) {
  const config = KARMARUSH_CONFIG[source];
  if (!config) throw new Error(`unsupported Karmarush source: ${source}`);
  const url = new URL(sourceUrl);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !config.pageHosts.some(root => host === root || host.endsWith(`.${root}`))) {
    throw new Error(`unsupported ${source} URL: ${sourceUrl}`);
  }
  return { url: url.toString(), meetId: url.searchParams.get('mid') || null };
}

function extractMeetIdAndFirebase(html, source) {
  const meetMatch = String(html || '').match(/(?:[?&]mid=|\bmeetid\s*[=:]\s*["']?|\bmid\s*[=:]\s*["']?)(\d+)/i);
  const config = KARMARUSH_CONFIG[source];
  const firebaseMatch = String(html || '').match(/\bfbURL\s*=\s*["']([^"']+)["']/i);
  return {
    meetId: meetMatch?.[1] || null,
    firebaseBase: firebaseMatch?.[1] || `https://${config.firebaseHost}`
  };
}

function firebasePath(base, meetId, child) {
  return `${String(base).replace(/\/$/, '')}/${encodeURIComponent(String(meetId))}/${child}.json`;
}

async function fetchKarmarushRows({ source, sourceUrl, targetMeetId, fetchImpl, timeoutMs } = {}) {
  const parsed = parseKarmarushUrl(source, sourceUrl);
  let meetId = parsed.meetId;
  let firebaseBase = `https://${KARMARUSH_CONFIG[source].firebaseHost}`;
  if (!meetId || parsed.url.includes('/event/')) {
    const html = await getText(parsed.url, { fetchImpl, timeoutMs });
    const resolved = extractMeetIdAndFirebase(html, source);
    meetId = meetId || resolved.meetId;
    firebaseBase = resolved.firebaseBase;
  }
  if (!meetId) throw new Error(`${source} page did not expose a meet id`);

  const options = { fetchImpl, timeoutMs };
  const [meta, meetEvents] = await Promise.all([
    getJson(firebasePath(firebaseBase, meetId, 'Meta'), options),
    getJson(firebasePath(firebaseBase, meetId, 'MeetEvents'), options)
  ]);
  return {
    source,
    sourceMeetId: String(meetId),
    sourceUrl: parsed.url,
    firebaseBase,
    meta: meta || {},
    meetEvents: meetEvents || {},
    rows: parseKarmarushRows({ source, sourceMeetId: meetId, sourceUrl: parsed.url, meta: meta || {}, meetEvents: meetEvents || {}, targetMeetId })
  };
}

async function fetchTimingRows({ source, sourceUrl, targetMeetId, targetMeet, fetchImpl, timeoutMs } = {}) {
  if (source === 'milesplit') return fetchMileSplitRows({ sourceUrl, targetMeetId, targetMeet, fetchImpl, timeoutMs });
  if (source === 'pt_timing' || source === 'leonetiming') {
    return fetchKarmarushRows({ source, sourceUrl, targetMeetId, fetchImpl, timeoutMs });
  }
  throw new Error(`no timing adapter exists for source: ${source}`);
}

function sourceDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function assertSourceDate(sourceResult, meet) {
  const sourceDates = [
    sourceDate(sourceResult.meet?.dateStart || sourceResult.meta?.startDate || sourceResult.meta?.date),
    sourceDate(sourceResult.meet?.dateEnd || sourceResult.meta?.endDate)
  ].filter(Boolean);
  const canonicalDates = [sourceDate(meet.date), sourceDate(meet.end_date)].filter(Boolean);
  if (sourceDates.length && canonicalDates.length && !sourceDates.some(value => canonicalDates.includes(value))) {
    throw new Error(`source_date_mismatch: source=${sourceDates.join(',')} database=${canonicalDates.join(',')}`);
  }
  return sourceDates[0] || null;
}

module.exports = {
  FOUR_BY_100,
  KARMARUSH_CONFIG,
  assertSourceDate,
  decodeFirestoreDocument,
  decodeFirestoreFields,
  decodeFirestoreValue,
  extractMeetIdAndFirebase,
  fetchKarmarushRows,
  fetchMileSplitRows,
  fetchTimingRows,
  firestoreRelayLegs,
  isFourBy100,
  normalizeEventText,
  normalizeRound,
  parseKarmarushRows,
  parseMileSplitRows,
  parseMileSplitUrl,
  selectMileSplitTimerMeet,
  parseKarmarushUrl,
  relayLegsFromKarmarush,
  sourceDate
};

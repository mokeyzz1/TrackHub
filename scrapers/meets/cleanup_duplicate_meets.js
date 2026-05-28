#!/usr/bin/env node
/**
 * Cleanup duplicate meet rows caused by date/name variations.
 *
 * Dry run:
 *   node cleanup_duplicate_meets.js --since 2026-04-01
 *
 * Apply:
 *   node cleanup_duplicate_meets.js --since 2026-04-01 --commit
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(operation, label, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = String(error?.message || error).includes('fetch failed') ||
        String(error?.details || '').includes('ConnectTimeoutError');

      if (!retryable || attempt === attempts) break;
      await sleep(1000 * attempt);
    }
  }

  throw new Error(`${label} failed: ${lastError?.message || lastError}`);
}

function chunk(items, size = 500) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const sinceIndex = args.indexOf('--since');
  return {
    commit: args.includes('--commit'),
    since: sinceIndex >= 0 ? args[sinceIndex + 1] : '2026-04-01',
    verbose: args.includes('--verbose')
  };
}

function normalizeMeetName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s*\[[^\]]+\]/g, '')
    .replace(/\s*\(outdoor\)\s*/g, ' ')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeLocation(location) {
  return (location || '')
    .split('*')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function rangeEnd(meet) {
  return meet.end_date || meet.date;
}

function rangesTouch(a, b) {
  const aStart = addDays(a.date, -1);
  const aEnd = addDays(rangeEnd(a), 1);
  const bStart = b.date;
  const bEnd = rangeEnd(b);
  return aStart <= bEnd && bStart <= aEnd;
}

async function fetchAllMeets(since) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await withRetry(() => supabase
        .from('meets')
        .select([
          'meet_id',
          'name',
          'date',
          'end_date',
          'location',
          'meet_url',
          'timing_platform',
          'tfrrs_url',
          'athletic_net_results_url',
          'wa_results_url',
          'results_status',
          'results_imported_at',
          'results_last_checked_at',
          'results_error',
          'status',
          'updated_at'
        ].join(','))
        .gte('date', since)
        .lt('date', new Date().toISOString().split('T')[0])
        .neq('status', 'upcoming')
        .order('date', { ascending: true })
        .range(from, from + pageSize - 1),
      `fetch meets ${from}`);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  return rows;
}

function buildDuplicateGroups(meets) {
  const buckets = new Map();

  for (const meet of meets) {
    const key = `${normalizeMeetName(meet.name)}|${normalizeLocation(meet.location)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(meet);
  }

  const groups = [];

  for (const bucket of buckets.values()) {
    const sorted = bucket.sort((a, b) => a.date.localeCompare(b.date) || a.meet_id - b.meet_id);
    let current = [];

    for (const meet of sorted) {
      if (current.length === 0) {
        current = [meet];
        continue;
      }

      const touchesGroup = current.some(existing => rangesTouch(existing, meet));
      if (touchesGroup) {
        current.push(meet);
      } else {
        if (current.length > 1) groups.push(current);
        current = [meet];
      }
    }

    if (current.length > 1) groups.push(current);
  }

  return groups;
}

async function countRows(table, meetId) {
  const { count, error } = await withRetry(() => supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('meet_id', meetId),
    `count ${table} ${meetId}`);

  if (error) {
    if (error.message?.includes(`relation "public.${table}" does not exist`)) return 0;
    throw error;
  }

  return count || 0;
}

async function fetchRows(table, meetId, select) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await withRetry(() => supabase
        .from(table)
        .select(select)
        .eq('meet_id', meetId)
        .range(from, from + pageSize - 1),
      `fetch ${table} ${meetId} ${from}`);

    if (error) {
      if (error.message?.includes(`relation "public.${table}" does not exist`)) return [];
      throw error;
    }

    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  return rows;
}

async function addReferenceCounts(group) {
  for (const meet of group) {
    meet._results = await countRows('results', meet.meet_id);
    meet._relayResults = await countRows('relay_results', meet.meet_id);
    meet._liveResults = await countRows('live_results', meet.meet_id);
    meet._entries = await countRows('meet_entries', meet.meet_id);
    meet._references = meet._results + meet._relayResults + meet._liveResults + meet._entries;
  }
}

function chooseCanonical(group) {
  return [...group].sort((a, b) => {
    const score = meetScore(b) - meetScore(a);
    if (score !== 0) return score;
    return a.meet_id - b.meet_id;
  })[0];
}

function meetScore(meet) {
  let score = 0;
  score += (meet._results || 0) * 5;
  score += (meet._relayResults || 0) * 4;
  score += (meet._liveResults || 0) * 2;
  score += (meet._entries || 0);
  if (meet.results_status === 'imported') score += 10000;
  if (meet.tfrrs_url) score += 1000;
  if (meet.athletic_net_results_url) score += 300;
  if (meet.wa_results_url) score += 200;
  if (meet.meet_url) score += 100;
  if (meet.end_date && meet.end_date !== meet.date) score += 50;
  return score;
}

function buildCanonicalUpdates(canonical, duplicates) {
  const updates = {};
  const allRows = [canonical, ...duplicates];
  const minDate = allRows.map(m => m.date).sort()[0];
  const maxEndDate = allRows.map(rangeEnd).sort().at(-1);

  if (canonical.date !== minDate) updates.date = minDate;
  if (rangeEnd(canonical) !== maxEndDate) updates.end_date = maxEndDate;

  for (const field of ['meet_url', 'timing_platform', 'tfrrs_url', 'athletic_net_results_url', 'wa_results_url']) {
    if (!canonical[field]) {
      const value = duplicates.find(m => m[field])?.[field];
      if (value) updates[field] = value;
    }
  }

  if (canonical.results_status !== 'imported') {
    if (allRows.some(m => m.results_status === 'imported')) updates.results_status = 'imported';
    else if (allRows.some(m => m.tfrrs_url)) updates.results_status = 'tfrrs_available';
  }

  const importedAt = allRows.map(m => m.results_imported_at).filter(Boolean).sort().at(-1);
  if (!canonical.results_imported_at && importedAt) updates.results_imported_at = importedAt;

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
  }

  return updates;
}

async function moveMeetReferences(fromMeetId, toMeetId, commit) {
  const stats = {
    resultsMoved: 0,
    resultsDeleted: 0,
    relaysMoved: 0,
    relaysDeleted: 0,
    liveMoved: 0,
    liveDeleted: 0,
    entriesMoved: 0,
    entriesDeleted: 0
  };

  await dedupeAndMoveRows({
    table: 'results',
    idField: 'result_id',
    fromMeetId,
    toMeetId,
    select: 'result_id,athlete_id,event_name,mark_raw,date',
    keyFor: row => [row.athlete_id, row.event_name, row.mark_raw, row.date].join('|'),
    movedKey: 'resultsMoved',
    deletedKey: 'resultsDeleted',
    stats,
    commit
  });

  await dedupeAndMoveRows({
    table: 'relay_results',
    idField: 'relay_result_id',
    fromMeetId,
    toMeetId,
    select: 'relay_result_id,team_id,event_name,mark_raw,date',
    keyFor: row => [row.team_id, row.event_name, row.mark_raw, row.date].join('|'),
    movedKey: 'relaysMoved',
    deletedKey: 'relaysDeleted',
    stats,
    commit
  });

  await dedupeAndMoveRows({
    table: 'live_results',
    idField: 'live_result_id',
    fromMeetId,
    toMeetId,
    select: 'live_result_id,participant_name,event_name,mark_raw,date',
    keyFor: row => [row.participant_name, row.event_name, row.mark_raw, row.date].join('|'),
    movedKey: 'liveMoved',
    deletedKey: 'liveDeleted',
    stats,
    commit
  });

  await dedupeAndMoveRows({
    table: 'meet_entries',
    idField: 'entry_id',
    fromMeetId,
    toMeetId,
    select: 'entry_id,event_name,athlete_name',
    keyFor: row => [row.event_name, row.athlete_name].join('|'),
    movedKey: 'entriesMoved',
    deletedKey: 'entriesDeleted',
    stats,
    commit
  });

  return stats;
}

async function dedupeAndMoveRows({ table, idField, fromMeetId, toMeetId, select, keyFor, movedKey, deletedKey, stats, commit }) {
  const [targetRows, sourceRows] = await Promise.all([
    fetchRows(table, toMeetId, select),
    fetchRows(table, fromMeetId, select)
  ]);

  const targetKeys = new Set(targetRows.map(keyFor));
  const idsToDelete = [];
  const idsToMove = [];

  for (const row of sourceRows) {
    const key = keyFor(row);

    if (targetKeys.has(key)) {
      idsToDelete.push(row[idField]);
      stats[deletedKey]++;
      continue;
    }

    idsToMove.push(row[idField]);
    targetKeys.add(key);
    stats[movedKey]++;
  }

  if (!commit) return;

  for (const ids of chunk(idsToDelete)) {
    const { error } = await withRetry(() => supabase
        .from(table)
        .delete()
        .in(idField, ids),
      `delete ${table} batch`);

    if (error) throw error;
  }

  for (const ids of chunk(idsToMove)) {
    const { error } = await withRetry(() => supabase
        .from(table)
        .update({ meet_id: toMeetId })
        .in(idField, ids),
      `move ${table} batch`);

    if (error) {
      // meet_entries can hit a unique constraint if old data has duplicate entries
      // within the same duplicate meet. Fall back to row-by-row for that rare case.
      if (table !== 'meet_entries') throw error;
      for (const id of ids) {
        const single = await withRetry(() => supabase
            .from(table)
            .update({ meet_id: toMeetId })
            .eq(idField, id),
          `move ${table} ${id}`);
        if (single.error) throw single.error;
      }
    }
  }
}

async function deleteMeet(meetId) {
  const { error } = await withRetry(() => supabase
      .from('meets')
      .delete()
      .eq('meet_id', meetId),
    `delete meet ${meetId}`);

  if (error) throw error;
}

async function updateMeet(meetId, updates) {
  if (Object.keys(updates).length === 0) return;

  const { error } = await withRetry(() => supabase
      .from('meets')
      .update(updates)
      .eq('meet_id', meetId),
    `update meet ${meetId}`);

  if (error) throw error;
}

async function main() {
  const options = parseArgs();

  console.log(options.commit ? 'MERGING DUPLICATE MEETS' : 'DRY RUN - DUPLICATE MEET CLEANUP');
  console.log(`Since: ${options.since}`);

  const meets = await fetchAllMeets(options.since);
  const groups = buildDuplicateGroups(meets);

  let duplicateRows = 0;
  let movedReferences = 0;
  const actionTotals = {
    resultsMoved: 0,
    resultsDeleted: 0,
    relaysMoved: 0,
    relaysDeleted: 0,
    liveMoved: 0,
    liveDeleted: 0,
    entriesMoved: 0,
    entriesDeleted: 0
  };

  for (const group of groups) {
    await addReferenceCounts(group);
    const canonical = chooseCanonical(group);
    const duplicates = group.filter(m => m.meet_id !== canonical.meet_id);
    duplicateRows += duplicates.length;
    movedReferences += duplicates.reduce((sum, m) => sum + m._references, 0);

    if (options.verbose) {
      console.log(`\n${canonical.name}`);
      console.log(`  Canonical: ${canonical.meet_id} (${canonical.date} to ${rangeEnd(canonical)}) refs=${canonical._references}`);
      for (const dup of duplicates) {
        console.log(`  Duplicate: ${dup.meet_id} (${dup.date} to ${rangeEnd(dup)}) refs=${dup._references}`);
      }
    }

    if (options.commit) {
      const updates = buildCanonicalUpdates(canonical, duplicates);
      await updateMeet(canonical.meet_id, updates);
    }

    for (const dup of duplicates) {
      const stats = await moveMeetReferences(dup.meet_id, canonical.meet_id, options.commit);
      for (const [key, value] of Object.entries(stats)) {
        actionTotals[key] += value;
      }
      if (options.commit) {
        await deleteMeet(dup.meet_id);
      }
    }
  }

  console.log('\nSUMMARY');
  console.log(`  Duplicate groups: ${groups.length}`);
  console.log(`  Duplicate rows: ${duplicateRows}`);
  console.log(`  References to move: ${movedReferences}`);
  console.log(`  Results moved/deleted: ${actionTotals.resultsMoved}/${actionTotals.resultsDeleted}`);
  console.log(`  Relays moved/deleted: ${actionTotals.relaysMoved}/${actionTotals.relaysDeleted}`);
  console.log(`  Live rows moved/deleted: ${actionTotals.liveMoved}/${actionTotals.liveDeleted}`);
  console.log(`  Entries moved/deleted: ${actionTotals.entriesMoved}/${actionTotals.entriesDeleted}`);
  console.log(options.commit ? '  Changes applied' : '  No changes made');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

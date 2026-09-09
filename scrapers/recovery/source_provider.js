/**
 * Classify a stored meet URL before an importer is selected.
 *
 * The database's meet_url column is intentionally a catch-all timing/live link. It is evidence,
 * not permission to send the URL to an arbitrary scraper. This module keeps provider detection
 * host-anchored and returns an explicit capability so callers can route supported sources and
 * inventory adapter work without guessing.
 */

const { isAthleticLiveHost } = require('../athletic-net/athletic_live_host');

const KNOWN_PROVIDER_HOSTS = [
  ['milesplit', ['milesplit.com', 'milesplit.live']],
  ['pt_timing', ['pttiming.com']],
  ['finish_timing', ['finishtiming.com', 'finishlynx.com']],
  ['trackscoreboard', ['trackscoreboard.com']],
  ['leonetiming', ['leonetiming.com']],
  ['blueridgetiming', ['blueridgetiming.live']],
  ['championshiptiming', ['championshiptiming.org']],
  ['spatotrack', ['spatotrack.com']],
  ['gingerbreadtiming', ['gingerbreadtiming.com']],
  ['tfmeetpro', ['tfmeetpro.com']],
  ['athletictiming', ['athletictiming.net']],
  ['trxctiming', ['trxctiming.com']],
  ['fat_live', ['fat.live']],
  ['adkinstrak', ['adkinstrak.com']],
  ['lexicontiming', ['lexicontiming.com']],
  ['timinginc', ['timinginc.com']],
  ['snaptiming', ['snaptiming.com']],
  ['raceservices_2l', ['2lraceservices.com']],
  ['halfmiletiming', ['halfmiletiming.com']],
  ['timingfirst', ['timingfirst.com']],
  ['tomahawktiming', ['tomahawktiming.com']],
  ['wingfootfinish', ['wingfootfinish.com']],
  ['tracksidetiming', ['tracksidetiming.com']],
  ['timerhub', ['timerhub.com']],
  ['onthemarktiming', ['onthemarktiming.com']],
];

function hostMatches(host, root) {
  return host === root || host.endsWith(`.${root}`);
}

function parseHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    parsed.hash = '';
    return parsed;
  } catch (_) {
    return null;
  }
}

function result(candidate, parsed, extra = {}) {
  return {
    url: parsed ? parsed.toString() : null,
    provider: candidate.provider,
    source: candidate.source || null,
    capability: candidate.capability,
    reason: candidate.reason || null,
    ...extra,
  };
}

function classifySourceUrl(value) {
  const parsed = parseHttpUrl(value);
  if (!parsed) {
    return {
      url: null,
      provider: value ? 'unknown' : 'none',
      source: null,
      capability: 'invalid_url',
      reason: value ? 'invalid_http_url' : 'missing_url',
    };
  }

  const host = parsed.hostname;
  const pathname = parsed.pathname;

  if ((host === 'tfrrs.org' || host.endsWith('.tfrrs.org')) && /\/results\/\d+(?:\/|$)/i.test(pathname)) {
    return result({ provider: 'tfrrs', source: 'tfrrs', capability: 'supported' }, parsed);
  }

  if ((host === 'athletic.net' || host.endsWith('.athletic.net'))
    && /\/TrackAndField\/meet\/\d+(?:\/|$)/i.test(pathname)) {
    return result({ provider: 'athletic_net', source: 'athletic_net', capability: 'supported' }, parsed);
  }

  if (isAthleticLiveHost(host) && /\/meets\/\d+(?:\/|$)/i.test(pathname)) {
    return result({ provider: 'athletic_net', source: 'athletic_net', capability: 'supported' }, parsed);
  }

  for (const [provider, roots] of KNOWN_PROVIDER_HOSTS) {
    if (!roots.some(root => hostMatches(host, root))) continue;
    if (provider === 'trackscoreboard') {
      return result({ provider, capability: 'policy_excluded', reason: 'trackscoreboard_excluded_from_4x100_worker' }, parsed);
    }
    if (['milesplit', 'pt_timing', 'leonetiming'].includes(provider)) {
      return result({ provider, source: provider, capability: 'supported' }, parsed);
    }
    return result({ provider, capability: 'adapter_required', reason: `adapter_not_implemented:${provider}` }, parsed);
  }

  if (host.includes('timing') || host.includes('results') || host.includes('live')) {
    return result({ provider: 'other_timing', capability: 'adapter_required', reason: 'adapter_not_implemented:other_timing' }, parsed);
  }

  return result({ provider: 'other', capability: 'adapter_required', reason: 'adapter_not_implemented:other' }, parsed);
}

function recoverySourceFromUrl(value, requested = 'auto') {
  const classification = classifySourceUrl(value);
  if (classification.capability !== 'supported') return null;
  if (requested !== 'auto' && classification.source !== requested) return null;
  return {
    source: classification.source,
    url: classification.url,
    provider: classification.provider,
  };
}

module.exports = {
  KNOWN_PROVIDER_HOSTS,
  classifySourceUrl,
  hostMatches,
  parseHttpUrl,
  recoverySourceFromUrl,
};

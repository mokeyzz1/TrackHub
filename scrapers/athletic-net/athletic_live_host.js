const ATHLETIC_LIVE_EXACT_HOSTS = new Set([
  'live.athletic.net',
  'live.jdlfasttrack.com',
  'live.herostiming.com',
  'live.mastiming.net',
  'live.mountaintiming.com',
  'results.blacksquirreltiming.com',
  'blueridgetiming.live',
]);

function isAthleticLiveHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  return ATHLETIC_LIVE_EXACT_HOSTS.has(host)
    || host === 'anet.live'
    || host.endsWith('.anet.live');
}

function isAthleticLiveUrl(value) {
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol)
      && isAthleticLiveHost(parsed.hostname)
      && /\/meets\/\d+(?:\/|$)/i.test(parsed.pathname);
  } catch (_) {
    return false;
  }
}

module.exports = {
  ATHLETIC_LIVE_EXACT_HOSTS,
  isAthleticLiveHost,
  isAthleticLiveUrl,
};

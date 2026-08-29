/**
 * Source pages use several display forms for relays. Keep the classification in one place so
 * a page that says "4x100m" is not parsed as an individual result simply because it omits the
 * word "relay".
 */
function isRelayEventName(eventName) {
  const value = String(eventName || '').trim().toLowerCase();
  if (!value) return false;

  if (/\b(?:relay|medley|shuttle)\b/.test(value)) return true;
  if (/\b(?:dmr|smr|shr)\b/.test(value)) return true;

  // Covers 4x100m, 4 x 400 meters, 4x880y, 4xMile, and similar source spellings.
  return /\b\d+\s*x\s*(?:\d+(?:\s*(?:m|meters?|y|yards?))?|mile)\b/.test(value);
}

module.exports = { isRelayEventName };

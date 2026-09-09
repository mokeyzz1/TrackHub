/**
 * Return whether a TFRRS relay table cell is a race time.
 *
 * Relay pages contain other decimal-looking values (wind, points, distances, and places), so the
 * seconds-only form intentionally requires two digits before the decimal. This accepts both the
 * sub-minute form used by 4x100 relays ("39.30") and the minute form used by longer relays
 * ("3:17.58").
 */
const RELAY_TIME_PATTERN = /^(?:\d{1,2}:\d{2}\.\d{2,3}|\d{2}\.\d{2,3})$/;

function isRelayTimeMark(value) {
  return RELAY_TIME_PATTERN.test(String(value || '').trim());
}

module.exports = { isRelayTimeMark, RELAY_TIME_PATTERN };

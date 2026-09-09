'use strict';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageContainsMeetDate(pageText, meetDate, toleranceDays = 3) {
  const base = new Date(`${meetDate}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return false;

  for (let offset = -toleranceDays; offset <= toleranceDays; offset += 1) {
    const candidate = new Date(base);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const month = candidate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    const shortMonth = candidate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = candidate.getUTCDate();
    const year = candidate.getUTCFullYear();
    const monthToken = `(?:${escapeRegex(month)}|${escapeRegex(shortMonth)})\\.?`;

    // TFRRS renders dates in several layouts. Require the year near the month/day so a current
    // annual edition cannot validate an older meet that happened on the same weekend.
    const monthFirst = new RegExp(`${monthToken}\\s+0?${day}(?:st|nd|rd|th)?(?:,|\\s){1,3}${year}\\b`, 'i');
    const dayFirst = new RegExp(`\\b0?${day}\\s+${monthToken}(?:,|\\s){1,3}${year}\\b`, 'i');
    if (monthFirst.test(pageText) || dayFirst.test(pageText)) return true;
  }

  return false;
}

module.exports = { pageContainsMeetDate };

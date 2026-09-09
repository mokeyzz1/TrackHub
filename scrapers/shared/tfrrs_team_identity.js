/**
 * Parse TFRRS team links for both four-year and junior-college teams.
 */

function parseTfrrsTeamInfo(url) {
  const match = String(url || '').match(/\/teams\/tf\/([A-Z]{2})_(?:j)?college_([mf])_(.+)\.html/i);
  if (!match) return null;

  return {
    state: match[1].toUpperCase(),
    gender: match[2].toLowerCase() === 'm' ? 'M' : 'F',
    teamSlug: match[3]
  };
}

module.exports = { parseTfrrsTeamInfo };

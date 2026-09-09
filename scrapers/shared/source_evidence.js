const { createHash } = require('node:crypto');

// Canonicalize JSON, not JavaScript objects: match the JSON sent to PostgreSQL (including
// Date/toJSON, omitted undefined fields, and null array slots), then sort object keys.
function canonicalJson(value) {
  const normalized = JSON.parse(JSON.stringify(value));
  function encode(item) {
    if (Array.isArray(item)) return `[${item.map(encode).join(',')}]`;
    if (item !== null && typeof item === 'object') {
      return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
    }
    return JSON.stringify(item);
  }
  return encode(normalized);
}

function sourceEvidence(record) {
  const evidence = {
    source_url: record.source_url || null,
    source_meet_key: record.source_meet_key || null,
    source_event_key: record.source_event_key || null,
    payload: record.payload ?? {},
  };
  const encoded = canonicalJson(evidence);
  return { ...JSON.parse(encoded), snapshot_hash: createHash('sha256').update(encoded).digest('hex') };
}

module.exports = { canonicalJson, sourceEvidence };

const snapshot = require('./schema_extended_20260905.json');
const sequenceState = require('./sequence_state_20260905.json');
const kinds = {
  sequences: 'sequence', defaults: 'column_default', schema_grants: 'schema_grant',
  relation_grants: 'relation_grant', column_grants: 'column_grant',
  function_grants: 'function_grant', default_grants: 'default_grant',
  enum_types: 'enum_type', extensions: 'extension', publications: 'publication',
  event_triggers: 'event_trigger', foreign_servers: 'foreign_server',
};

function buildExtendedChecklist() {
  return Object.entries(kinds).flatMap(([section, kind]) => (snapshot[section] || []).map(metadata => {
    const { schema, name } = metadata;
    const relation = metadata.relation || null;
    const ownership = ['public', 'ingest'].includes(schema) ? 'application' : schema === 'archive' ? 'recovery' : 'platform';
    const state = kind === 'sequence' && sequenceState.find(s => s.sequence === `${schema}.${name}`);
    const next = state ? BigInt(state.last_value) + (state.is_called ? BigInt(metadata.increment) : 0n) : null;
    const healthy = state && metadata.increment === '1' && metadata.cycle === false
      && (state.maximum_id === null || next > BigInt(state.maximum_id)) && next <= BigInt(metadata.maximum);
    return {
      id: [kind, schema, relation, name].filter(Boolean).join(':'), kind, schema, relation, name,
      ownership, priority: ownership === 'application' ? 'P1' : 'P0',
      purpose: healthy ? `Allocate identifiers for ${metadata.owned_relation}.${metadata.owned_column}.`
        : 'Captured extended catalog object; semantic/access review remains explicit work.',
      problems: healthy ? 'No sequence drift at this read-only checkpoint; gaps are not an error.'
        : 'Not yet assessed; no automatic cleanup is authorized by this inventory.',
      proposedImprovement: healthy ? 'Preserve allocation state; recheck after explicit-ID imports, never rewind to fill gaps.'
        : 'Review ownership, consumers and security before changing this object.',
      status: healthy ? 'verified' : 'captured', dependencies: ['SAFE-01', 'MODEL-01', 'SEC-01'],
      evidence: ['EXTENDED_SCHEMA_COVERAGE_20260905.md'],
      verification: healthy ? 'Read last_value/is_called without nextval; next allocation exceeds maximum stored ID and is within bounds.' : null,
      rollback: healthy ? 'No mutation; preserve existing sequence state.' : null,
      appliedLive: false, metadata,
    };
  }));
}
module.exports = { buildExtendedChecklist };

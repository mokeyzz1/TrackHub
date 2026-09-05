const snapshot = require('./settings_catalog_20260905.json');

function buildSettingsChecklist() {
  const base = {
    schema: null, relation: null, ownership: 'platform', priority: 'P1', status: 'captured',
    problems: 'Captured configuration scope is not a workload or security signoff.',
    proposedImprovement: 'Review effective connection scope and managed ownership before proposing any change.',
    dependencies: ['MODEL-01', 'SEC-01', 'PERF-01'],
    evidence: ['SETTINGS_COVERAGE_20260905.md', 'settings_catalog_20260905.json'],
    verification: null, rollback: 'Read-only inventory; no configuration mutation.', appliedLive: false,
  };
  return [
    ...snapshot.settings.map(metadata => ({
      ...base, id: `database_setting:${metadata.name}`, kind: 'database_setting', name: metadata.name,
      purpose: metadata.description || 'Undocumented setting; provider documentation review remains open.', metadata,
    })),
    ...snapshot.override_scopes.map(metadata => ({
      ...base, id: `configuration_scope:${encodeURIComponent(metadata.database)}:${encodeURIComponent(metadata.role)}`,
      kind: 'configuration_scope', name: `${metadata.database}/${metadata.role}`,
      purpose: 'Persistent role/database default overrides; values intentionally redacted.', metadata,
    })),
  ];
}

module.exports = { buildSettingsChecklist };

const columns = require('./schema_catalog_20260905.json');
const objects = require('./schema_objects_20260905.json');

function buildChecklist() {
  const items = [];
  function add(kind, schema, name, metadata, relation = null) {
    const ownership = ['public', 'ingest'].includes(schema) ? 'application'
      : schema === 'archive' ? 'recovery' : 'platform';
    items.push({
      id: [kind, schema, relation, name].filter(Boolean).join(':'),
      kind, schema, relation, name, ownership,
      priority: ownership === 'application' ? 'P1' : 'P0',
      purpose: 'Pending semantic review; catalog definition is evidence, not an inferred purpose.',
      problems: 'Not yet assessed against current data and consumers.',
      proposedImprovement: ownership === 'application'
        ? 'Review necessity and semantics before proposing a change.'
        : 'Preserve; review security, dependencies and recovery without rewriting provider internals.',
      status: 'captured',
      dependencies: ['SAFE-01', 'MIG-01'],
      evidence: [],
      verification: null,
      rollback: null,
      appliedLive: false,
      metadata,
    });
  }
  for (const r of objects.relations) add(['v', 'm'].includes(r.kind) ? 'view' : 'table', r.schema, r.name, r);
  for (const c of columns.columns) add('column', c.schema, c.column, c, c.relation);
  for (const c of objects.constraints) add(c.type === 'f' ? 'relationship' : 'constraint', c.schema, c.name, c, c.relation);
  for (const i of objects.indexes) add('index', i.schema, i.name, i, i.relation);
  for (const p of columns.policies) add('policy', p.schemaname, p.policyname, p, p.tablename);
  for (const f of objects.functions) add('function', f.schema, `${f.name}(${f.arguments})`, f);
  for (const t of objects.triggers) add('trigger', t.schema, t.name, t, t.relation);
  // Verified additive live migration after the baseline catalog; preserve the dated baseline.
  items.push(...require('./source_evidence_objects_20260905.json').items);
  items.push(...require('./source_link_objects_20260905.json').items);
  items.push(...require('./build_extended_checklist').buildExtendedChecklist());
  items.sort((a, b) => a.id.localeCompare(b.id));
  return { snapshotDate: '2026-09-05', purpose: 'Object-level register for MASTER_CHECKLIST.md', items };
}

module.exports = { buildChecklist };
if (require.main === module) process.stdout.write(`${JSON.stringify(buildChecklist(), null, 2)}\n`);

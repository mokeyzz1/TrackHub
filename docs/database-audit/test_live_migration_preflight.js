#!/usr/bin/env node
// Read-only live proof: compare every active local migration with the current private ledger.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { preflight } = require('./migration_preflight');

const root = path.resolve(__dirname, '../..');
const env = require('dotenv').config({ path: path.join(root, '.env'), quiet: true }).parsed || {};
const approvals = [
  ...require('./migration_approved_history_20260905.json').entries,
  ...require('./migration_approved_history_20260906.json').entries,
  ...require('./migration_approved_history_20260908.json').entries,
  ...require('./migration_approved_history_20260909.json').entries,
];

async function main() {
  const directory = path.join(root, 'supabase/migrations');
  const files = fs.readdirSync(directory)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => ({ file, sql: fs.readFileSync(path.join(directory, file), 'utf8') }));
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl',
    password: env.DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60000,
  });
  await client.connect();
  try {
    const ledger = (await client.query(
      'select version,name,statements from supabase_migrations.schema_migrations order by version'
    )).rows;
    const result = preflight(files, ledger, approvals);
    console.log(JSON.stringify({ ...result, liveLedgerEntries: ledger.length }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

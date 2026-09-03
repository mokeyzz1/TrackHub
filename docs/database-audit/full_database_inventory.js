// Read-only live database inventory.
// This script only queries PostgreSQL catalogs and table row counts.
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ quiet: true });

const supabaseUrl = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL);
const projectRef = supabaseUrl.hostname.split('.')[0];
const connectionString =
  `postgresql://postgres.${projectRef}:${encodeURIComponent(process.env.DB_PASSWORD)}` +
  '@aws-0-us-west-2.pooler.supabase.com:5432/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
});

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function main() {
  await client.connect();
  await client.query("set statement_timeout = '120s'");

  const relations = (await client.query(`
    select n.nspname as schema_name,
           c.relname as table_name,
           c.relkind,
           c.relispartition,
           c.relrowsecurity,
           c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p', 'f')
       and n.nspname not like 'pg_%'
       and n.nspname <> 'information_schema'
     order by n.nspname, c.relname
  `)).rows;

  const requestedSchemas = process.argv
    .filter((arg) => arg.startsWith('--schema='))
    .map((arg) => arg.slice('--schema='.length));
  const requestedTables = process.argv
    .filter((arg) => arg.startsWith('--table='))
    .map((arg) => arg.slice('--table='.length));
  const selectedRelations = requestedTables.length
    ? relations.filter((relation) => requestedTables.includes(`${relation.schema_name}.${relation.table_name}`))
    : requestedSchemas.length
    ? relations.filter((relation) => requestedSchemas.includes(relation.schema_name))
    : relations;

  const counts = [];
  for (const relation of selectedRelations) {
    const qualified = `${quoteIdentifier(relation.schema_name)}.${quoteIdentifier(relation.table_name)}`;
    try {
      const result = await client.query(`select count(*)::bigint as row_count from ${qualified}`);
      counts.push({ ...relation, row_count: result.rows[0].row_count });
      console.error(`${relation.schema_name}.${relation.table_name}: ${result.rows[0].row_count}`);
    } catch (error) {
      counts.push({ ...relation, row_count: null, error: error.message });
      console.error(`${relation.schema_name}.${relation.table_name}: ERROR ${error.message}`);
    }
  }

  const columns = (await client.query(`
    select table_schema as schema_name,
           table_name,
           column_name,
           ordinal_position,
           data_type,
           udt_schema,
           udt_name,
           is_nullable,
           column_default,
           character_maximum_length,
           numeric_precision,
           numeric_scale,
           datetime_precision
      from information_schema.columns
     where table_schema not in ('pg_catalog', 'information_schema')
       ${requestedSchemas.length ? `and table_schema in (${requestedSchemas.map((_, index) => `$${index + 1}`).join(', ')})` : ''}
     order by table_schema, table_name, ordinal_position
  `, requestedSchemas)).rows;

  const types = (await client.query(`
    select n.nspname as schema_name,
           t.typname as type_name,
           t.typtype,
           format_type(t.typbasetype, t.typtypmod) as base_type,
           array(
             select e.enumlabel
               from pg_enum e
              where e.enumtypid = t.oid
              order by e.enumsortorder
           ) as enum_values
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname not like 'pg_%'
       and n.nspname <> 'information_schema'
       ${requestedSchemas.length ? `and n.nspname in (${requestedSchemas.map((_, index) => `$${index + 1}`).join(', ')})` : ''}
       and t.typtype in ('e', 'd')
     order by n.nspname, t.typname
  `, requestedSchemas)).rows;

  if (process.argv.includes('--summary')) {
    const bySchema = new Map();
    for (const row of counts) {
      const entry = bySchema.get(row.schema_name) || { schema_name: row.schema_name, tables: 0, rows: 0, count_errors: 0 };
      entry.tables += 1;
      if (row.row_count == null) entry.count_errors += 1;
      else entry.rows += Number(row.row_count);
      bySchema.set(row.schema_name, entry);
    }
    const columnSummary = new Map();
    for (const column of columns) {
      const entry = columnSummary.get(column.schema_name) || { schema_name: column.schema_name, columns: 0, nullable: 0 };
      entry.columns += 1;
      if (column.is_nullable === 'YES') entry.nullable += 1;
      columnSummary.set(column.schema_name, entry);
    }
    console.log(JSON.stringify({
      schema_summary: [...bySchema.values()].sort((a, b) => a.schema_name.localeCompare(b.schema_name)),
      column_summary: [...columnSummary.values()].sort((a, b) => a.schema_name.localeCompare(b.schema_name)),
      custom_types: types,
    }, null, 2));
  } else {
    console.log(JSON.stringify({ counts, columns, types }, null, 2));
  }
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());

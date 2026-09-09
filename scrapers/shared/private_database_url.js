/**
 * Resolve the private Postgres connection used by the ingestion control plane.
 *
 * Local CLI commands commonly have DB_PASSWORD in the project root .env while hosted
 * jobs provide INGEST_DATABASE_URL directly. Never replace an explicit URL.
 */
function ensureIngestDatabaseUrl(env = process.env) {
  if (env.INGEST_DATABASE_URL || !env.DB_PASSWORD) {
    return env.INGEST_DATABASE_URL || null;
  }

  const host = env.INGEST_DATABASE_HOST
    || env.SUPABASE_DB_HOST
    || 'db.hunbahsnaeeztmzqpnrl.supabase.co';
  const port = env.INGEST_DATABASE_PORT || '5432';
  const database = env.INGEST_DATABASE_NAME || 'postgres';
  const user = env.INGEST_DATABASE_USER || 'postgres';
  env.INGEST_DATABASE_URL = `postgresql://${user}:${encodeURIComponent(env.DB_PASSWORD)}@${host}:${port}/${database}`;
  return env.INGEST_DATABASE_URL;
}

module.exports = { ensureIngestDatabaseUrl };

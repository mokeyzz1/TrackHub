const rootEnv = require('dotenv').config({ path: '../.env' }).parsed || {};
const { Client } = require('pg');
(async () => {
  const c = new Client({ host:'db.hunbahsnaeeztmzqpnrl.supabase.co', port:5432, user:'postgres',
    password: rootEnv.DB_PASSWORD, database:'postgres', ssl:{rejectUnauthorized:false}, statement_timeout:900000 });
  await c.connect();
  await c.query('CREATE TEMP TABLE rc AS SELECT athlete_id, count(*)::int n FROM results WHERE athlete_id IS NOT NULL GROUP BY 1');
  await c.query('CREATE INDEX ON rc(athlete_id)');
  await c.query('CREATE TEMP TABLE lc AS SELECT athlete_id, count(*)::int n FROM relay_athletes WHERE athlete_id IS NOT NULL GROUP BY 1');
  await c.query('CREATE INDEX ON lc(athlete_id)');
  await c.query(`CREATE TEMP TABLE ac AS
    SELECT a.athlete_id, a.full_name, a.school_id,
           COALESCE(rc.n,0) AS n_results, COALESCE(lc.n,0) AS n_legs
    FROM athletes a LEFT JOIN rc ON rc.athlete_id=a.athlete_id LEFT JOIN lc ON lc.athlete_id=a.athlete_id`);
  await c.query('CREATE INDEX ON ac(full_name)');
  const { rows:[r] } = await c.query(`
    SELECT count(*)::int total,
           count(*) FILTER (WHERE n_results=0 AND n_legs=0)::int empty_shells,
           count(*) FILTER (WHERE n_results=0 AND n_legs=0 AND school_id=1835)::int empty_unattached
    FROM ac`);
  console.log('overall:', r);
  const { rows:[d] } = await c.query(`
    SELECT count(*)::int empty_with_real_namesake
    FROM ac e WHERE e.n_results=0 AND e.n_legs=0
      AND EXISTS (SELECT 1 FROM ac b WHERE b.full_name=e.full_name AND b.n_results>0)`);
  console.log('deletable (name matches a real athlete):', d);
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});

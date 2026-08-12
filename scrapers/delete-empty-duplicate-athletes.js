const rootEnv = require('dotenv').config({ path: '../.env' }).parsed || {};
const { Client } = require('pg');
const APPLY = process.argv.includes('--apply');
(async () => {
  const c = new Client({ host:'db.hunbahsnaeeztmzqpnrl.supabase.co', port:5432, user:'postgres',
    password: rootEnv.DB_PASSWORD, database:'postgres', ssl:{rejectUnauthorized:false}, statement_timeout:900000 });
  await c.connect();
  const t = async (n,q) => { await c.query(`CREATE TEMP TABLE ${n} AS ${q}`); await c.query(`CREATE INDEX ON ${n}(athlete_id)`); };
  await t('rc','SELECT athlete_id FROM results WHERE athlete_id IS NOT NULL GROUP BY 1');
  await t('lc','SELECT athlete_id FROM relay_athletes WHERE athlete_id IS NOT NULL GROUP BY 1');
  await t('pc','SELECT athlete_id FROM athlete_prs WHERE athlete_id IS NOT NULL GROUP BY 1');
  await t('sc','SELECT athlete_id FROM athlete_team_seasons WHERE athlete_id IS NOT NULL GROUP BY 1');
  await t('ec','SELECT athlete_id FROM external_ids WHERE athlete_id IS NOT NULL GROUP BY 1');
  await c.query(`CREATE TEMP TABLE ac AS
    SELECT a.athlete_id, a.full_name,
      (rc.athlete_id IS NOT NULL) hr,(lc.athlete_id IS NOT NULL) hl,(pc.athlete_id IS NOT NULL) hp,
      (sc.athlete_id IS NOT NULL) hs,(ec.athlete_id IS NOT NULL) he
    FROM athletes a
    LEFT JOIN rc ON rc.athlete_id=a.athlete_id LEFT JOIN lc ON lc.athlete_id=a.athlete_id
    LEFT JOIN pc ON pc.athlete_id=a.athlete_id LEFT JOIN sc ON sc.athlete_id=a.athlete_id
    LEFT JOIN ec ON ec.athlete_id=a.athlete_id`);
  await c.query('CREATE INDEX ON ac(full_name)');
  const { rows: doomed } = await c.query(`SELECT e.athlete_id FROM ac e
    WHERE NOT e.hr AND NOT e.hl AND NOT e.hp AND NOT e.hs AND NOT e.he
      AND EXISTS (SELECT 1 FROM ac b WHERE b.full_name=e.full_name AND b.hr)`);
  const ids = doomed.map(r=>r.athlete_id);
  console.log(`empty duplicate athlete records: ${ids.length.toLocaleString()}`);
  if (!APPLY) { console.log('(dry run)'); await c.end(); return; }
  require('fs').writeFileSync(`delete-empty-athletes-${Date.now()}.json`, JSON.stringify(ids));
  await c.query('CREATE TABLE IF NOT EXISTS athletes_empty_backup (LIKE athletes INCLUDING DEFAULTS)');
  let saved=0, del=0;
  for (let i=0;i<ids.length;i+=2000) {
    const ch = ids.slice(i,i+2000);
    saved += (await c.query('INSERT INTO athletes_empty_backup SELECT * FROM athletes WHERE athlete_id = ANY($1::int[])',[ch])).rowCount;
    del   += (await c.query('DELETE FROM athletes WHERE athlete_id = ANY($1::int[])',[ch])).rowCount;
  }
  console.log(`backed up ${saved.toLocaleString()}, deleted ${del.toLocaleString()}`);
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});

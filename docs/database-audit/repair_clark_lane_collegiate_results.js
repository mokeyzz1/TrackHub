#!/usr/bin/env node
// Defaults to a rollback rehearsal. --commit repairs only the source-linked Clark/Lane 4x100 facts.
const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const evidence=require('./clark_lane_collegiate_result_repair_20260906.json');
const operation=evidence.operation;
const commit=process.argv.includes('--commit');

async function main(){
  assert.equal(evidence.result_ids.length,52);assert.equal(evidence.relay_result_ids.length,13);assert.equal(evidence.team_mapping.length,4);
  const c=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:60000});
  await c.connect();
  try{
    await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query('select pg_advisory_xact_lock(hashtext($1))',[operation]);
    assert.equal((await c.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation])).rows[0].n,0,'Operation already applied');
    const urls=evidence.team_mapping.flatMap(row=>[row.old_team_url,row.new_team_url]);
    const teams=(await c.query('select t.*,s.official_name,s.institution_type from teams t join schools s on s.school_id=t.school_id where t.tfrrs_team_url=any($1::text[]) for update', [urls])).rows;
    assert.equal(teams.length,8,'Expected exactly four old and four corrected team rows');
    const byUrl=new Map(teams.map(row=>[row.tfrrs_team_url,row]));
    const pairs=evidence.team_mapping.map(row=>{const old=byUrl.get(row.old_team_url),target=byUrl.get(row.new_team_url);assert(old&&target);assert.notEqual(old.team_id,target.team_id);return {...row,old,target};});
    const oldIds=pairs.map(row=>row.old.team_id),newIds=pairs.map(row=>row.target.team_id),meetIds=evidence.meet_ids;
    const results=(await c.query('select * from results where result_id=any($1::bigint[]) order by result_id for update',[evidence.result_ids])).rows;
    assert.equal(results.length,52);
    const resultSet=new Set(results.map(row=>String(row.result_id)));
    assert.deepEqual([...resultSet].sort(),evidence.result_ids.map(String).sort());
    const expectedPairByOld=new Map(pairs.map(row=>[String(row.old.team_id),row]));
    for(const row of results){
      const pair=expectedPairByOld.get(String(row.team_id));assert(pair,`Result ${row.result_id} has unexpected current team`);
      assert.equal(row.event_type_id,33);assert.equal(row.event_name,'4x100m');assert(meetIds.includes(row.meet_id));
      assert.equal((await c.query('select count(*)::int n from athletes where athlete_id=$1 and school_id=$2',[row.athlete_id,pair.target.school_id])).rows[0].n,1,`Result ${row.result_id} athlete is not in target college`);
    }
    const criteria=(await c.query(`
      select r.result_id,r.team_id
      from results r join athletes a on a.athlete_id=r.athlete_id
      where a.school_id=any($1::bigint[]) and r.team_id=any($2::bigint[])
        and r.meet_id=any($3::int[]) and r.event_type_id=33 and r.event_name='4x100m'
      order by r.result_id`,[pairs.map(row=>row.target.school_id),oldIds,meetIds])).rows;
    assert.deepEqual(criteria.map(row=>String(row.result_id)).sort(),evidence.result_ids.map(String).sort(),'Scope includes an unexpected or missing result');
    const relays=(await c.query('select * from relay_results where relay_result_id=any($1::int[]) order by relay_result_id for update',[evidence.relay_result_ids])).rows;
    assert.equal(relays.length,13);assert.deepEqual(relays.map(row=>row.relay_result_id),evidence.relay_result_ids.slice().sort((a,b)=>a-b));
    for(const row of relays){const pair=expectedPairByOld.get(String(row.team_id));assert(pair,`Relay ${row.relay_result_id} has unexpected current team`);assert.equal(row.event_type_id,33);assert.equal(row.event_name,'4x100m');assert(meetIds.includes(row.meet_id));}
    const sourceResultCount=(await c.query(`select count(distinct sl.result_id)::int n from ingest.source_links sl join ingest.source_records sr on sr.source_record_id=sl.source_record_id where sl.result_id=any($1::bigint[]) and sl.source='tfrrs' and sl.link_status='linked' and sr.source_url=any($2::text[])`,[evidence.result_ids,evidence.source_result_urls])).rows[0].n;
    const sourceRelayCount=(await c.query(`select count(distinct sl.relay_result_id)::int n from ingest.source_links sl join ingest.source_records sr on sr.source_record_id=sl.source_record_id where sl.relay_result_id=any($1::int[]) and sl.source='tfrrs' and sl.link_status='linked' and sr.source_url=any($2::text[])`,[evidence.relay_result_ids,evidence.source_result_urls])).rows[0].n;
    assert.equal(sourceResultCount,52,'Every individual fact needs a linked TFRRS source leg');assert.equal(sourceRelayCount,13,'Every relay parent needs a linked TFRRS source');
    for(const [table,rows,pk] of [['public.results',results,'result_id'],['public.relay_results',relays,'relay_result_id']])for(const row of rows)await c.query('insert into ingest.fact_cleanup_archive(operation_key,source_table,source_pk,row_data) values($1,$2,$3,$4)',[operation,table,String(row[pk]),JSON.stringify(row)]);
    assert.equal((await c.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation])).rows[0].n,65);
    let resultUpdates=0,relayUpdates=0;
    for(const pair of pairs){
      let q=await c.query('update results set team_id=$1 where result_id=any($2::bigint[]) and team_id=$3',[pair.target.team_id,results.filter(row=>row.team_id===pair.old.team_id).map(row=>row.result_id),pair.old.team_id]);resultUpdates+=q.rowCount;
      q=await c.query('update relay_results set team_id=$1 where relay_result_id=any($2::int[]) and team_id=$3',[pair.target.team_id,relays.filter(row=>row.team_id===pair.old.team_id).map(row=>row.relay_result_id),pair.old.team_id]);relayUpdates+=q.rowCount;
    }
    assert.equal(resultUpdates,52);assert.equal(relayUpdates,13);
    const afterResults=(await c.query('select * from results where result_id=any($1::bigint[]) order by result_id',[evidence.result_ids])).rows;
    for(let i=0;i<afterResults.length;i++)assert.deepEqual({...afterResults[i],team_id:results[i].team_id},results[i],'Performance fields changed');
    const afterRelays=(await c.query('select * from relay_results where relay_result_id=any($1::int[]) order by relay_result_id',[evidence.relay_result_ids])).rows;
    for(let i=0;i<afterRelays.length;i++)assert.deepEqual({...afterRelays[i],team_id:relays[i].team_id},relays[i],'Relay performance fields changed');
    await c.query(commit?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({operation,committed:commit,source_verified_results:52,source_verified_relay_parents:13,archived_before_images:65,legs_changed:0,clubs_changed:0},null,2));
  }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});

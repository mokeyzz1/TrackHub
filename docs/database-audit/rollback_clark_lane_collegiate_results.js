#!/usr/bin/env node
// Defaults to a rollback rehearsal. --commit restores the archived team assignments.
const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const evidence=require('./clark_lane_collegiate_result_repair_20260906.json');
const operation=evidence.operation;
const commit=process.argv.includes('--commit');

async function main(){
  const c=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:60000});
  await c.connect();
  try{
    await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query('select pg_advisory_xact_lock(hashtext($1))',[operation]);
    const archive=(await c.query("select source_table,source_pk,row_data from ingest.fact_cleanup_archive where operation_key=$1 order by source_table,source_pk::bigint for update",[operation])).rows;
    assert.equal(archive.length,65,'Expected 65 exact before-images');
    assert.equal(archive.filter(row=>row.source_table==='public.results').length,52);assert.equal(archive.filter(row=>row.source_table==='public.relay_results').length,13);
    const beforeResults=archive.filter(row=>row.source_table==='public.results');
    const beforeRelays=archive.filter(row=>row.source_table==='public.relay_results');
    const resultIds=beforeResults.map(row=>row.source_pk),relayIds=beforeRelays.map(row=>row.source_pk);
    const currentResults=(await c.query('select result_id,team_id from results where result_id=any($1::bigint[]) for update',[resultIds])).rows;
    const currentRelays=(await c.query('select relay_result_id,team_id from relay_results where relay_result_id=any($1::int[]) for update',[relayIds])).rows;
    assert.equal(currentResults.length,52);assert.equal(currentRelays.length,13);
    assert(currentResults.every(row=>String(row.team_id)!==String(beforeResults.find(x=>x.source_pk===String(row.result_id)).row_data.team_id)),'A result has already reverted or diverged');
    assert(currentRelays.every(row=>String(row.team_id)!==String(beforeRelays.find(x=>x.source_pk===String(row.relay_result_id)).row_data.team_id)),'A relay has already reverted or diverged');
    for(const row of beforeResults){const current=currentResults.find(x=>String(x.result_id)===row.source_pk);assert(current);assert.notEqual(String(current.team_id),String(row.row_data.team_id),'Result no longer has repaired target; refusing rollback');}
    for(const row of beforeRelays){const current=currentRelays.find(x=>String(x.relay_result_id)===row.source_pk);assert(current);assert.notEqual(String(current.team_id),String(row.row_data.team_id),'Relay no longer has repaired target; refusing rollback');}
    for(const row of beforeResults){const n=await c.query('update results set team_id=$1 where result_id=$2 and team_id<>$1',[row.row_data.team_id,row.source_pk]);assert.equal(n.rowCount,1);}
    for(const row of beforeRelays){const n=await c.query('update relay_results set team_id=$1 where relay_result_id=$2 and team_id<>$1',[row.row_data.team_id,row.source_pk]);assert.equal(n.rowCount,1);}
    assert.equal((await c.query('select count(*)::int n from results where result_id=any($1::bigint[]) and team_id=any($2::bigint[])',[resultIds,[...new Set(beforeResults.map(row=>row.row_data.team_id))]])).rows[0].n,52);
    assert.equal((await c.query('select count(*)::int n from relay_results where relay_result_id=any($1::int[]) and team_id=any($2::int[])',[relayIds,[...new Set(beforeRelays.map(row=>row.row_data.team_id))]])).rows[0].n,13);
    if(commit)await c.query('delete from ingest.fact_cleanup_archive where operation_key=$1',[operation]);
    await c.query(commit?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({operation,rollback_committed:commit,results_restored:52,relay_parents_restored:13,archive_removed:commit},null,2));
  }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});

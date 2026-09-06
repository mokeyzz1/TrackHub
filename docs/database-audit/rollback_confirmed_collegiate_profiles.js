#!/usr/bin/env node
// Defaults to a rollback rehearsal. --commit restores the exact archived school_id values.
const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const manifest=require('./collegiate_school_onboarding_20260906.json');
const review=require('./collegiate_source_team_review_20260906.json');
const operation='20260906_confirmed_collegiate_profile_repair';
const commit=process.argv.includes('--commit');
const schoolKey=url=>url.replace(/_(m|f)_/i,'_X_').replace(/_(m|f)\.html$/i,'_X.html');

function expectedSchools(){
  const officialBySource=new Map(manifest.map(row=>[row.source_name,row.official_name]));
  const sourceByGroup=new Map();
  const owners=new Map();
  for(const source of review.association_confirmed){
    const key=schoolKey(source.source_url);
    const prior=sourceByGroup.get(key);
    if(prior)assert.equal(prior,source.source_team);
    sourceByGroup.set(key,source.source_team);
    const officialName=officialBySource.get(source.source_team);assert(officialName);
    for(const athlete of source.athletes){
      const id=String(athlete.athlete_id);
      if(owners.has(id))assert.equal(owners.get(id),officialName);
      owners.set(id,officialName);
    }
  }
  assert.equal(owners.size,1188);
  return owners;
}

async function main(){
  const client=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:60000});
  await client.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('select pg_advisory_xact_lock(hashtext($1))',[operation]);
    const archive=(await client.query("select source_pk,row_data from ingest.fact_cleanup_archive where operation_key=$1 and source_table='public.athletes' order by source_pk::bigint for update",[operation])).rows;
    assert.equal(archive.length,1184,'Expected all 1,184 profile before-images');
    assert.equal(new Set(archive.map(row=>row.source_pk)).size,1184,'Duplicate archived athlete');
    assert(archive.every(row=>String(row.row_data.school_id)==='1835'),'Every archived profile must have been Unattached');
    const ids=archive.map(row=>row.source_pk);
    const expected=expectedSchools();
    const schools=(await client.query('select school_id,official_name from schools where official_name=any($1::text[])',[[...new Set(expected.values())]])).rows;
    assert.equal(schools.length,50);
    const schoolIds=new Map(schools.map(row=>[row.official_name,String(row.school_id)]));
    const current=(await client.query('select athlete_id,school_id from athletes where athlete_id=any($1::bigint[]) for update',[ids])).rows;
    assert.equal(current.length,1184,'Every repaired athlete must still exist');
    assert(current.every(row=>String(row.school_id)===schoolIds.get(expected.get(String(row.athlete_id)))),'A repaired profile has diverged from its reviewed school; refusing rollback');
    const result=await client.query(`
      update public.athletes athlete
      set school_id=(archive.row_data->>'school_id')::bigint
      from ingest.fact_cleanup_archive archive
      where archive.operation_key=$1
        and archive.source_table='public.athletes'
        and athlete.athlete_id=archive.source_pk::bigint
    `,[operation]);
    assert.equal(result.rowCount,1184);
    assert.equal((await client.query('select count(*)::int n from athletes where athlete_id=any($1::bigint[]) and school_id=1835',[ids])).rows[0].n,1184);
    if(commit)await client.query('delete from ingest.fact_cleanup_archive where operation_key=$1',[operation]);
    await client.query(commit?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({operation,rollback_committed:commit,profiles_restored:1184,archive_removed:commit},null,2));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

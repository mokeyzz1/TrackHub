#!/usr/bin/env node
// Runs the catalog migration inside a transaction and rolls it back unless --commit is explicit.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const {TeamAliasResolver}=require('../../scrapers/shared/team_alias_resolver');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const manifest=require('./collegiate_school_onboarding_20260906.json');
const review=require(process.argv[2]||'./collegiate_source_team_review_20260906.json');
const migrationPath=process.argv[3]||path.join(__dirname,'../../supabase/migrations/20260906170106_onboard_confirmed_collegiate_schools.sql');
const commit=process.argv.includes('--commit');
const migrationSql=fs.readFileSync(migrationPath,'utf8');
for(const table of ['athletes','results','relay_results','relay_athletes','meets']){
  assert(!new RegExp(`(?:insert\\s+into|update|delete\\s+from|truncate)\\s+(?:public\\.)?${table}\\b`,'i').test(migrationSql),`Migration mutates fact table ${table}`);
}

async function main(){
  const client=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:60000});
  await client.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("select pg_advisory_xact_lock(hashtext('20260906_confirmed_collegiate_catalog'))");
    const before={
      divisions:Number((await client.query("select count(*) n from divisions where code='NWAC'")).rows[0].n),
      schools:Number((await client.query('select count(*) n from schools where lower(official_name)=any($1::text[])',[manifest.map(row=>row.official_name.toLowerCase())])).rows[0].n),
      teams:Number((await client.query('select count(*) n from teams where tfrrs_team_url=any($1::text[])',[review.association_confirmed.map(row=>row.source_url)])).rows[0].n)
    };
    await client.query(migrationSql);
    const divisions=(await client.query("select code,classification_kind from divisions where code='NWAC'")).rows;
    assert.deepEqual(divisions,[{code:'NWAC',classification_kind:'association'}]);
    const schools=(await client.query('select school_id,official_name,institution_type,division from schools where lower(official_name)=any($1::text[])',[manifest.map(row=>row.official_name.toLowerCase())])).rows;
    assert.equal(schools.length,50);
    assert(schools.every(row=>row.institution_type==='collegiate'));
    const teams=(await client.query('select team_id,gender,tfrrs_team_url from teams where tfrrs_team_url=any($1::text[])',[review.association_confirmed.map(row=>row.source_url)])).rows;
    assert.equal(teams.length,88);
    const resolver=await TeamAliasResolver.load(client,'tfrrs');
    for(const source of review.association_confirmed){
      const match=source.source_url.match(/_([mf])_(.+?)\.html$/i);assert(match);
      const team=teams.find(row=>row.tfrrs_team_url===source.source_url);assert(team);
      const resolved=resolver.resolve({source:'tfrrs',sourceTeamKey:match[2],sourceTeamName:source.source_team,sourceGender:match[1]});
      assert(resolved,`Alias failed to resolve ${source.source_url}`);
      assert.equal(String(resolved.team_id),String(team.team_id),`Alias resolved to wrong team for ${source.source_url}`);
    }
    const delta={divisions:1-before.divisions,schools:50-before.schools,teams:88-before.teams};
    await client.query(commit?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({committed:commit,after:{divisions:1,schools:50,teams:88,aliases_verified:88},live_delta:delta,fact_tables_untouched_by_sql:true},null,2));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

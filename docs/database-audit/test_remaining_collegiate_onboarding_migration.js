#!/usr/bin/env node
// Runs the catalog migration in a transaction; rollback is the default.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const {TeamAliasResolver}=require('../../scrapers/shared/team_alias_resolver');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const manifest=require('./remaining_collegiate_school_onboarding_20260907.json');
const review=require('./collegiate_source_team_review_20260906.json');
const migrationPath=path.join(__dirname,'../../supabase/migrations/20260907183959_onboard_remaining_verified_collegiate_schools.sql');
const migrationSql=fs.readFileSync(migrationPath,'utf8');
const transactionalSql=migrationSql
  .replace(/^\s*BEGIN;\s*/i,'')
  .replace(/\s*COMMIT;\s*$/i,'');
const commit=process.argv.includes('--commit');

for(const table of ['athletes','results','relay_results','relay_athletes','meets']){
  assert(!new RegExp(`(?:insert\\s+into|update|delete\\s+from|truncate)\\s+(?:public\\.)?${table}\\b`,'i').test(migrationSql),`Catalog migration mutates fact table ${table}`);
}

async function main(){
  assert.equal(manifest.length,14);
  assert.equal(new Set(manifest.map(row=>row.source_name)).size,14);
  const reviewed=new Map(review.association_unresolved.map(row=>[row.source_url,row]));
  const sourceUrls=manifest.flatMap(row=>row.source_urls);
  assert.equal(sourceUrls.length,20);
  const athleteOwners=new Map();
  for(const row of manifest)for(const url of row.source_urls){
    const source=reviewed.get(url);assert(source,`Missing reviewed source ${url}`);
    assert.equal(source.source_team,row.source_name);
    for(const athlete of source.athletes){
      const id=String(athlete.athlete_id);
      assert(!athleteOwners.has(id),`Athlete ${id} has multiple collegiate owners`);
      athleteOwners.set(id,row.official_name);
    }
  }
  assert.equal(athleteOwners.size,178);
  const excluded=review.association_unresolved.filter(row=>row.source_team==='USMAPS').flatMap(row=>row.athletes);
  assert.equal(excluded.length,14);
  assert(excluded.every(row=>!athleteOwners.has(String(row.athlete_id))));

  const client=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:60000});
  await client.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("select pg_advisory_xact_lock(hashtext('20260907_remaining_collegiate_catalog'))");
    const before={
      schools:Number((await client.query('select count(*) n from schools where lower(official_name)=any($1::text[])',[manifest.map(row=>row.official_name.toLowerCase())])).rows[0].n),
      aliases:Number((await client.query('select count(*) n from ingest.team_aliases where source=$1 and normalized_source_team_name=any($2::text[])',['tfrrs',manifest.map(row=>row.source_name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim())])).rows[0].n)
    };
    await client.query(transactionalSql);
    const divisions=(await client.query("select code,classification_kind from divisions where code=any($1::text[])",[['INDEPENDENT','NSAC','CONADEIP','RSEQ-COL']])).rows;
    assert.equal(divisions.length,4);
    const schools=(await client.query('select school_id,official_name,institution_type,division from schools where lower(official_name)=any($1::text[])',[manifest.map(row=>row.official_name.toLowerCase())])).rows;
    assert.equal(schools.length,14);
    assert(schools.every(row=>row.institution_type==='collegiate'));
    for(const row of manifest){
      const school=schools.find(s=>s.official_name.toLowerCase()===row.official_name.toLowerCase());assert(school);
      assert.equal(school.division,row.division_code,`Wrong classification for ${row.official_name}`);
    }
    const resolver=await TeamAliasResolver.load(client,'tfrrs');
    for(const row of manifest)for(const url of row.source_urls){
      const source=reviewed.get(url);
      const gender=url.match(/_([mf])_/i)[1].toUpperCase();
      const tail=url.match(/_[mf]_(.*?)\.html$/i)[1];
      const key=tail||row.source_name;
      const resolved=resolver.resolve({source:'tfrrs',sourceTeamKey:key,sourceTeamName:row.source_name,sourceGender:gender});
      assert(resolved,`Alias failed for ${url}`);
    }
    const afterAliases=Number((await client.query("select count(*) n from ingest.team_aliases where source='tfrrs' and notes='Source-verified collegiate identity; reviewed 2026-09-07.'")).rows[0].n);
    assert.equal(afterAliases,20);
    await client.query(commit?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({committed:commit,verified_collegiate_athletes:178,excluded_usmaps_athletes:14,canonical_schools:14,new_schools:14-before.schools,source_aliases:20,prior_related_aliases:before.aliases,fact_tables_untouched:true},null,2));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

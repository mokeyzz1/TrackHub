#!/usr/bin/env node
// Defaults to rollback rehearsal. --commit applies only the reviewed 178-profile mapping.
const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const manifest=require('./remaining_collegiate_school_onboarding_20260907.json');
const review=require('./collegiate_source_team_review_20260906.json');
const operation='20260907_remaining_collegiate_profile_repair';
const unattachedSchoolId='1835';
const commit=process.argv.includes('--commit');

function buildEvidence(){
  const sources=new Map(review.association_unresolved.map(row=>[row.source_url,row]));
  const owners=new Map();
  for(const school of manifest)for(const url of school.source_urls){
    const source=sources.get(url);assert(source,`Missing source ${url}`);
    assert.equal(source.source_team,school.source_name);
    for(const athlete of source.athletes){
      const id=String(athlete.athlete_id);
      assert(!owners.has(id),`Athlete ${id} appears under multiple schools`);
      owners.set(id,{athlete_id:id,tfrrs_athlete_id:String(athlete.tfrrs_athlete_id),official_name:school.official_name});
    }
  }
  assert.equal(owners.size,178);
  for(const source of review.association_unresolved.filter(row=>row.source_team==='USMAPS'))
    for(const athlete of source.athletes)assert(!owners.has(String(athlete.athlete_id)),'USMAPS athlete entered collegiate repair');
  return owners;
}

async function main(){
  const evidence=buildEvidence();
  const client=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:60000});
  await client.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('select pg_advisory_xact_lock(hashtext($1))',[operation]);
    assert.equal((await client.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation])).rows[0].n,0,'Operation already applied');
    const names=[...new Set([...evidence.values()].map(row=>row.official_name))];
    const schools=(await client.query('select school_id,official_name,institution_type from schools where official_name=any($1::text[]) for update',[names])).rows;
    assert.equal(schools.length,14);
    assert(schools.every(row=>row.institution_type==='collegiate'));
    const schoolIds=new Map(schools.map(row=>[row.official_name,String(row.school_id)]));
    const ids=[...evidence.keys()];
    const before=(await client.query('select * from athletes where athlete_id=any($1::bigint[]) order by athlete_id for update',[ids])).rows;
    assert.equal(before.length,178);
    for(const athlete of before){
      const expected=evidence.get(String(athlete.athlete_id));
      assert.equal(String(athlete.tfrrs_athlete_id),expected.tfrrs_athlete_id,`TFRRS identity changed for ${athlete.athlete_id}`);
      assert.equal(String(athlete.school_id),unattachedSchoolId,`Athlete ${athlete.athlete_id} is no longer Unattached`);
    }
    await client.query(`
      insert into ingest.fact_cleanup_archive(operation_key,source_table,source_pk,row_data)
      select $1,'public.athletes',a.athlete_id::text,to_jsonb(a)
      from public.athletes a where a.athlete_id=any($2::bigint[]) order by a.athlete_id
    `,[operation,ids]);
    assert.equal((await client.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation])).rows[0].n,178);
    let updated=0;
    for(const [officialName,targetSchoolId] of schoolIds){
      const schoolAthletes=[...evidence.values()].filter(row=>row.official_name===officialName).map(row=>row.athlete_id);
      const result=await client.query('update athletes set school_id=$1,updated_at=now() where athlete_id=any($2::bigint[]) and school_id=$3',[targetSchoolId,schoolAthletes,unattachedSchoolId]);
      assert.equal(result.rowCount,schoolAthletes.length,`Incomplete update for ${officialName}`);
      updated+=result.rowCount;
    }
    assert.equal(updated,178);
    const after=(await client.query('select * from athletes where athlete_id=any($1::bigint[]) order by athlete_id',[ids])).rows;
    for(let i=0;i<after.length;i++){
      const expected=evidence.get(String(after[i].athlete_id));
      assert.equal(String(after[i].school_id),schoolIds.get(expected.official_name));
      assert.deepEqual({...after[i],school_id:before[i].school_id,updated_at:before[i].updated_at},before[i],`Unexpected field change for ${after[i].athlete_id}`);
    }
    const usmapsIds=review.association_unresolved.filter(row=>row.source_team==='USMAPS').flatMap(row=>row.athletes.map(a=>String(a.athlete_id)));
    assert.equal((await client.query('select count(*)::int n from athletes where athlete_id=any($1::bigint[]) and school_id=$2',[usmapsIds,unattachedSchoolId])).rows[0].n,14);
    await client.query(commit?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({operation,committed:commit,profiles_repaired:178,archived_before_images:178,excluded_usmaps_unchanged:14,result_rows_changed:0},null,2));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

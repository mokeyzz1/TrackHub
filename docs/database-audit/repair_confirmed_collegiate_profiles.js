#!/usr/bin/env node
// Defaults to a rollback rehearsal. --commit applies only the reviewed collegiate profile mapping.
const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const manifest=require('./collegiate_school_onboarding_20260906.json');
const review=require('./collegiate_source_team_review_20260906.json');
const operation='20260906_confirmed_collegiate_profile_repair';
const unattachedSchoolId='1835';
const commit=process.argv.includes('--commit');
const schoolKey=url=>url.replace(/_(m|f)_/i,'_X_').replace(/_(m|f)\.html$/i,'_X.html');

function buildEvidence(){
  const manifestBySource=new Map(manifest.map(row=>[row.source_name,row]));
  assert.equal(manifestBySource.size,50,'Expected 50 unique confirmed collegiate schools');
  const groups=new Map();
  for(const source of review.association_confirmed){
    const key=schoolKey(source.source_url);
    const group=groups.get(key)||{source_name:source.source_team,athletes:new Map()};
    assert.equal(group.source_name,source.source_team,`Inconsistent source team for ${key}`);
    for(const athlete of source.athletes){
      const id=String(athlete.athlete_id);
      const prior=group.athletes.get(id);
      if(prior)assert.equal(prior.tfrrs_athlete_id,athlete.tfrrs_athlete_id,`Conflicting TFRRS id for athlete ${id}`);
      group.athletes.set(id,{athlete_id:id,tfrrs_athlete_id:String(athlete.tfrrs_athlete_id),name:athlete.name});
    }
    groups.set(key,group);
  }
  assert.equal(groups.size,50,'Expected one group for every confirmed school');
  const owners=new Map();
  for(const group of groups.values()){
    const school=manifestBySource.get(group.source_name);
    assert(school,`Missing manifest row for ${group.source_name}`);
    for(const athlete of group.athletes.values()){
      assert(!owners.has(athlete.athlete_id),`Athlete ${athlete.athlete_id} appears under multiple schools`);
      owners.set(athlete.athlete_id,{...athlete,official_name:school.official_name});
    }
  }
  assert.equal(owners.size,1188,'Expected complete 1,188-athlete confirmed cohort');
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

    const schools=(await client.query("select school_id,official_name,institution_type from schools where official_name=any($1::text[]) for update",[[...new Set([...evidence.values()].map(row=>row.official_name))]])).rows;
    assert.equal(schools.length,50,'All confirmed schools must exist exactly once');
    assert(schools.every(row=>row.institution_type==='collegiate'),'Every target school must be collegiate');
    const schoolIds=new Map(schools.map(row=>[row.official_name,String(row.school_id)]));

    const ids=[...evidence.keys()];
    const before=(await client.query('select * from athletes where athlete_id=any($1::bigint[]) order by athlete_id for update',[ids])).rows;
    assert.equal(before.length,1188,'Every reviewed athlete must still exist');
    let alreadyCorrect=0;
    const repair=[];
    for(const athlete of before){
      const expected=evidence.get(String(athlete.athlete_id));
      assert(expected,`Unexpected athlete ${athlete.athlete_id}`);
      assert.equal(String(athlete.tfrrs_athlete_id),expected.tfrrs_athlete_id,`TFRRS identity changed for athlete ${athlete.athlete_id}`);
      const targetSchoolId=schoolIds.get(expected.official_name);
      if(String(athlete.school_id)===targetSchoolId){alreadyCorrect++;continue;}
      assert.equal(String(athlete.school_id),unattachedSchoolId,`Athlete ${athlete.athlete_id} is no longer Unattached or correctly mapped`);
      repair.push({...expected,target_school_id:targetSchoolId});
    }
    assert.equal(alreadyCorrect,4,'Expected the four previously repaired USSU women');
    assert.equal(repair.length,1184,'Expected 1,184 remaining collegiate profile repairs');

    await client.query(`
      insert into ingest.fact_cleanup_archive(operation_key,source_table,source_pk,row_data)
      select $1,'public.athletes',a.athlete_id::text,to_jsonb(a)
      from public.athletes a
      where a.athlete_id=any($2::bigint[])
      order by a.athlete_id
    `,[operation,repair.map(row=>row.athlete_id)]);
    assert.equal((await client.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation])).rows[0].n,1184,'Archive must contain one exact before-image per changed athlete');

    let updated=0;
    for(const [officialName,targetSchoolId] of schoolIds){
      const schoolAthletes=repair.filter(row=>row.official_name===officialName).map(row=>row.athlete_id);
      if(!schoolAthletes.length)continue;
      const result=await client.query('update athletes set school_id=$1 where athlete_id=any($2::bigint[]) and school_id=$3',[targetSchoolId,schoolAthletes,unattachedSchoolId]);
      assert.equal(result.rowCount,schoolAthletes.length,`Incomplete update for ${officialName}`);
      updated+=result.rowCount;
    }
    assert.equal(updated,1184);

    const after=(await client.query('select * from athletes where athlete_id=any($1::bigint[]) order by athlete_id',[ids])).rows;
    assert.equal(after.length,before.length);
    for(let i=0;i<after.length;i++){
      const expected=evidence.get(String(after[i].athlete_id));
      assert.equal(String(after[i].school_id),schoolIds.get(expected.official_name),`Wrong target school for athlete ${after[i].athlete_id}`);
      assert(new Date(after[i].updated_at)>=new Date(before[i].updated_at),`updated_at moved backwards for ${after[i].athlete_id}`);
      assert.deepEqual({...after[i],school_id:before[i].school_id,updated_at:before[i].updated_at},before[i],`Non-school athlete field changed for ${after[i].athlete_id}`);
    }
    await client.query(commit?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({operation,committed:commit,collegiate_athletes:1188,already_correct:4,profiles_repaired:1184,archived_before_images:1184,result_rows_changed:0,club_athletes_changed:0},null,2));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

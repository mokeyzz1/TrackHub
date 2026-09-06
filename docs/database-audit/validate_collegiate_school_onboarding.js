#!/usr/bin/env node
// Read-only validator for the association-confirmed collegiate onboarding cohort.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const manifest=require('./collegiate_school_onboarding_20260906.json');
const review=require(process.argv[2]||'./collegiate_source_team_review_20260906.json');
const schoolKey=url=>url.replace(/_(m|f)_/i,'_X_').replace(/_(m|f)\.html$/i,'_X.html');
const norm=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');

async function main(){
  const groups=new Map();
  for(const row of review.association_confirmed){
    const key=schoolKey(row.source_url);
    const group=groups.get(key)||{source_name:row.source_team,source_urls:[],athletes:new Set()};
    assert.equal(group.source_name,row.source_team,`Inconsistent source label for ${key}`);
    group.source_urls.push(row.source_url);
    for(const athlete of row.athletes)group.athletes.add(String(athlete.athlete_id));
    groups.set(key,group);
  }
  assert.equal(groups.size,manifest.length,'Manifest must cover every confirmed school group exactly once');
  assert.equal(new Set(manifest.map(row=>row.source_name)).size,manifest.length,'Duplicate source_name in manifest');
  assert.deepEqual([...groups.values()].map(row=>row.source_name).sort(),manifest.map(row=>row.source_name).sort(),'Manifest/source review mismatch');
  const athleteOwners=new Map();
  for(const group of groups.values())for(const athleteId of group.athletes){
    assert(!athleteOwners.has(athleteId),`Athlete ${athleteId} belongs to multiple confirmed schools`);
    athleteOwners.set(athleteId,group.source_name);
  }
  assert.equal(athleteOwners.size,1188,'Expected complete 1,188-athlete confirmed cohort');

  const client=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:20000});
  await client.connect();
  try{
    await client.query('BEGIN READ ONLY');
    const divisions=(await client.query('select division_id,code from divisions')).rows;
    const schools=(await client.query('select school_id,official_name,short_name,city,state,division,division_id,institution_type from schools')).rows;
    const teams=(await client.query('select team_id,school_id,gender,tfrrs_team_url from teams')).rows;
    const divisionCodes=new Set(divisions.map(row=>row.code));
    const plan=[];
    for(const row of manifest){
      const group=[...groups.values()].find(item=>item.source_name===row.source_name);
      const exact=schools.filter(s=>norm(s.official_name)===norm(row.official_name));
      const existing=row.existing_school_id?schools.filter(s=>String(s.school_id)===String(row.existing_school_id)):exact;
      assert(existing.length<=1,`Multiple canonical school rows for ${row.official_name}`);
      if(row.existing_school_id){
        assert.equal(existing.length,1,`Missing expected existing school ${row.existing_school_id}`);
        assert.equal(norm(existing[0].official_name),norm(row.official_name));
      }
      if(existing.length){
        assert.equal(existing[0].institution_type,'collegiate',`Wrong institution type for ${row.official_name}`);
        assert.equal(existing[0].state,row.state,`Wrong state for ${row.official_name}`);
        assert.equal(existing[0].division,row.division_code,`Wrong division/association for ${row.official_name}`);
      }
      const existingTeams=teams.filter(t=>group.source_urls.includes(t.tfrrs_team_url));
      assert([0,group.source_urls.length].includes(existingTeams.length),`Partial team coverage for ${row.source_name}`);
      if(existing.length)assert.equal(existingTeams.length,group.source_urls.length,`Existing team coverage mismatch for ${row.source_name}`);
      else assert.equal(existingTeams.length,0,`Source URL already belongs to another team for ${row.source_name}`);
      plan.push({source_name:row.source_name,official_name:row.official_name,division_code:row.division_code,division_exists:divisionCodes.has(row.division_code),action:existing.length?'reuse':'create',source_urls:group.source_urls,athletes:group.athletes.size});
    }
    await client.query('ROLLBACK');
    const output={schools:plan.length,athletes:athleteOwners.size,reuse:plan.filter(x=>x.action==='reuse').length,create:plan.filter(x=>x.action==='create').length,missing_division_codes:[...new Set(plan.filter(x=>!x.division_exists).map(x=>x.division_code))],teams_to_create:plan.filter(x=>x.action==='create').reduce((n,x)=>n+x.source_urls.length,0),plan};
    fs.writeFileSync(process.argv[3]||'/tmp/collegiate-school-onboarding-plan-20260906.json',JSON.stringify(output,null,2));
    console.log(JSON.stringify({...output,plan:undefined},null,2));
  }finally{await client.end();}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

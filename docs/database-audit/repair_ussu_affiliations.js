#!/usr/bin/env node
// Defaults to a full rollback rehearsal. --commit applies the reviewed evidence set.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {TeamAliasResolver,normalizeTeamAlias}=require('../../scrapers/shared/team_alias_resolver');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const operation='20260906_ussu_affiliation_repair';
async function main(){
 const dir=process.argv[2]; const commit=process.argv.includes('--commit');
 const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json')));
 const evidence=JSON.parse(fs.readFileSync(path.join(dir,'verification.json')));
 assert.equal(evidence.length,174); assert(evidence.every(r=>r.status==='verified'));
 const ids=evidence.map(r=>r.result_id);assert.equal(new Set(ids).size,174);
 const c=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:20000});
 await c.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[operation]);
  const oldArchive=await c.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation]);
  assert.equal(oldArchive.rows[0].n,0,'Operation already applied; inspect postconditions instead of replaying');
  const athletes=(await c.query('select * from athletes where athlete_id=any($1::bigint[]) order by athlete_id for update',[before.athletes.map(a=>a.athlete_id)])).rows;
  const results=(await c.query('select * from results where athlete_id=any($1::bigint[]) order by result_id for update',[before.athletes.map(a=>a.athlete_id)])).rows;
  assert.equal(JSON.stringify(athletes),JSON.stringify(before.athletes),'Athlete snapshot changed');
  assert.equal(JSON.stringify(results),JSON.stringify(before.results),'Result snapshot changed');
  assert.equal(athletes.length,16); assert(athletes.every(a=>a.school_id==='1835'));
  assert.equal(results.filter(r=>ids.includes(r.result_id)&&r.team_id===null).length,174);
  const relays=(await c.query('select * from relay_results where relay_result_id=any($1::int[]) order by relay_result_id for update',[[210772,210780,215292,220016,240861]])).rows;
  const legs=(await c.query('select * from relay_athletes where relay_result_id=any($1::int[]) order by relay_result_id,leg_order for update',[relays.map(r=>r.relay_result_id)])).rows;
  assert.equal(relays.length,5);assert.equal(legs.length,20);assert(relays.every(r=>r.team_id===null));
  const first=relays.find(r=>r.relay_result_id===215292),dup=relays.find(r=>r.relay_result_id===240861);
  for(const key of ['meet_id','event_type_id','mark_raw','place','round','event_id'])assert.deepEqual(first[key],dup[key]);
  const lineup=id=>legs.filter(l=>l.relay_result_id===id).map(l=>[l.athlete_id,l.tfrrs_athlete_id,l.athlete_name,l.leg_order]);
  assert.deepEqual(lineup(215292),lineup(240861));
  // Every relay leg must have a verified same-meet, same-event, same-mark source result.
  for(const relay of relays)for(const leg of legs.filter(l=>l.relay_result_id===relay.relay_result_id)){
   assert(results.some(r=>r.athlete_id===String(leg.athlete_id)&&r.meet_id===relay.meet_id&&r.event_type_id===relay.event_type_id&&r.mark_raw===relay.mark_raw&&ids.includes(r.result_id)),'Unverified relay leg');
  }
  for(const [table,column] of [['ingest.source_links','relay_result_id'],['ingest.observations','canonical_relay_id']]){
   assert.equal((await c.query(`select count(*)::int n from ${table} where ${column}=240861`)).rows[0].n,0,'Duplicate has source dependencies');
  }
  assert.equal((await c.query("select count(*)::int n from schools where lower(official_name) like '%sports university%' or lower(official_name) like '%sports academy%' or lower(short_name)='ussu'")).rows[0].n,0);
  fs.writeFileSync(path.join(dir,'repair-before.json'),JSON.stringify({operation,athletes,results,relays,legs},null,2));
  fs.writeFileSync(path.join(__dirname,'ussu_verified_results_20260906.json'),JSON.stringify({operation,athletes:athletes.map(a=>({athlete_id:a.athlete_id,tfrrs_athlete_id:a.tfrrs_athlete_id,name:a.full_name})),results:evidence,relay_ids:relays.map(r=>r.relay_result_id)},null,2));
  for(const [table,rows,pk] of [['public.athletes',athletes,'athlete_id'],['public.results',results.filter(r=>ids.includes(r.result_id)),'result_id'],['public.relay_results',relays,'relay_result_id'],['public.relay_athletes',legs.filter(l=>l.relay_result_id===240861),'relay_athlete_id']]){
   for(const row of rows)await c.query('insert into ingest.fact_cleanup_archive(operation_key,source_table,source_pk,row_data) values($1,$2,$3,$4)',[operation,table,String(row[pk]),JSON.stringify(row)]);
  }
  const school=(await c.query("insert into schools(official_name,short_name,city,state,institution_type,division,division_id) select 'United States Sports University','USSU','Daphne','AL','collegiate','NAIA',division_id from divisions where code='NAIA' returning school_id")).rows[0];assert(school);
  const team=(await c.query("insert into teams(school_id,gender,team_name,team_type,tfrrs_team_url) values($1,'M','USSU','collegiate','https://www.tfrrs.org/teams/tf/AL_college_m_United_States_Sports_Academy.html') returning team_id",[school.school_id])).rows[0];
  for(const name of ['USSU']){
   await c.query("insert into ingest.team_aliases(source,source_team_key,source_team_name,source_gender,team_id,match_method,notes,normalized_source_team_key,normalized_source_team_name) values('tfrrs','United_States_Sports_Academy',$1,'M',$2,'verified_alias',$3,$4,$5)",[name,team.team_id,operation,normalizeTeamAlias('United_States_Sports_Academy'),normalizeTeamAlias(name)]);
  }
  const resolver=await TeamAliasResolver.load(c,'tfrrs');
  assert.equal(resolver.resolve({source:'tfrrs',sourceTeamKey:'United_States_Sports_Academy',sourceTeamName:'USSU',sourceGender:'M'}).team_id,Number(team.team_id));
  assert.equal((await c.query('update athletes set school_id=$1 where athlete_id=any($2::bigint[]) and school_id=1835',[school.school_id,athletes.map(a=>a.athlete_id)])).rowCount,16);
  assert.equal((await c.query('update results set team_id=$1 where result_id=any($2::bigint[]) and team_id is null',[team.team_id,ids])).rowCount,174);
  assert.equal((await c.query('delete from relay_results where relay_result_id=240861')).rowCount,1);
  assert.equal((await c.query('update relay_results set team_id=$1 where relay_result_id=any($2::int[]) and team_id is null',[team.team_id,[210772,210780,215292,220016]])).rowCount,4);
  const after=(await c.query('select * from results where athlete_id=any($1::bigint[]) order by result_id',[athletes.map(a=>a.athlete_id)])).rows;
  assert.equal(after.length,results.length);
  for(let i=0;i<after.length;i++)assert.deepEqual({...after[i],team_id:results[i].team_id},results[i],'Performance facts changed');
  assert(after.filter(r=>ids.includes(r.result_id)).every(r=>r.team_id===team.team_id));
  assert.deepEqual(after.filter(r=>!ids.includes(r.result_id)),results.filter(r=>!ids.includes(r.result_id)),'Unattached result changed');
  assert.equal((await c.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation])).rows[0].n,199);
  await c.query(commit?'COMMIT':'ROLLBACK');
  const outcome={operation,committed:commit,school_id:school.school_id,team_id:team.team_id,athletes:16,results:174,relays:4,duplicate_relays_archived:1,archived_rows:199};
  fs.writeFileSync(path.join(dir,commit?'applied.json':'rehearsal.json'),JSON.stringify(outcome,null,2));console.log(outcome);
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

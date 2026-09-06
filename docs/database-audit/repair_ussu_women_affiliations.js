#!/usr/bin/env node
// Defaults to a rollback rehearsal. --commit applies the verified USSU women's repair.
const assert=require('node:assert/strict');const path=require('node:path');const {Client}=require('pg');
const {TeamAliasResolver,normalizeTeamAlias}=require('../../scrapers/shared/team_alias_resolver');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const evidence=require('./ussu_women_verified_results_20260906.json');
const operation='20260906_ussu_women_affiliation_repair';
async function main(){const commit=process.argv.includes('--commit');assert.equal(evidence.athletes.length,4);assert.equal(evidence.results.length,27);
 const c=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:20000});await c.connect();
 try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query('select pg_advisory_xact_lock(hashtext($1))',[operation]);
  assert.equal((await c.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation])).rows[0].n,0,'Operation already applied');
  const school=(await c.query("select * from schools where official_name='United States Sports University' for update")).rows;assert.equal(school.length,1);assert.equal(school[0].institution_type,'collegiate');
  assert.equal((await c.query("select count(*)::int n from teams where school_id=$1 and gender='F'",[school[0].school_id])).rows[0].n,0);
  const athletes=(await c.query('select * from athletes where athlete_id=any($1::bigint[]) order by athlete_id for update',[evidence.athletes])).rows;assert.equal(athletes.length,4);assert(athletes.every(a=>String(a.school_id)==='1835'));
  const results=(await c.query('select * from results where result_id=any($1::bigint[]) order by result_id for update',[evidence.results])).rows;assert.equal(results.length,27);assert(results.every(r=>r.team_id===null));assert(results.every(r=>evidence.athletes.includes(String(r.athlete_id))));
  for(const [table,rows,pk] of [['public.athletes',athletes,'athlete_id'],['public.results',results,'result_id']])for(const row of rows)await c.query('insert into ingest.fact_cleanup_archive(operation_key,source_table,source_pk,row_data) values($1,$2,$3,$4)',[operation,table,String(row[pk]),JSON.stringify(row)]);
  const team=(await c.query("insert into teams(school_id,gender,team_name,team_type,tfrrs_team_url) values($1,'F','USSU','collegiate',$2) returning team_id",[school[0].school_id,evidence.source_team])).rows[0];
  const sourceKey='United_States_Sports_Academy';await c.query("insert into ingest.team_aliases(source,source_team_key,source_team_name,source_gender,team_id,match_method,notes,normalized_source_team_key,normalized_source_team_name) values('tfrrs',$1,'USSU','F',$2,'verified_alias',$3,$4,$5)",[sourceKey,team.team_id,operation,normalizeTeamAlias(sourceKey),normalizeTeamAlias('USSU')]);
  const resolver=await TeamAliasResolver.load(c,'tfrrs');assert.equal(resolver.resolve({source:'tfrrs',sourceTeamKey:sourceKey,sourceTeamName:'USSU',sourceGender:'F'}).team_id,Number(team.team_id));
  assert.equal((await c.query('update athletes set school_id=$1 where athlete_id=any($2::bigint[]) and school_id=1835',[school[0].school_id,evidence.athletes])).rowCount,4);
  assert.equal((await c.query('update results set team_id=$1 where result_id=any($2::bigint[]) and team_id is null',[team.team_id,evidence.results])).rowCount,27);
  const after=(await c.query('select * from results where result_id=any($1::bigint[]) order by result_id',[evidence.results])).rows;assert.equal(after.length,27);
  for(let i=0;i<after.length;i++)assert.deepEqual({...after[i],team_id:null},results[i],'Performance fact changed');assert(after.every(r=>r.team_id===team.team_id));
  assert.equal((await c.query('select count(*)::int n from ingest.fact_cleanup_archive where operation_key=$1',[operation])).rows[0].n,31);
  await c.query(commit?'COMMIT':'ROLLBACK');console.log({operation,committed:commit,school_id:school[0].school_id,team_id:team.team_id,athletes:4,results:27,archived_rows:31});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

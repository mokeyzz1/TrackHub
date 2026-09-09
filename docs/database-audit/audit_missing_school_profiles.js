#!/usr/bin/env node
// Read-only, resumable source discovery. A profile team is a candidate, never a result repair.
const fs=require('node:fs');const path=require('node:path');const cheerio=require('cheerio');const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
async function main(){
 const dir=process.argv[2];if(!dir)throw Error('Supply audit output directory');fs.mkdirSync(dir,{recursive:true});
 const c=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:20000});await c.connect();
 let athletes,teams;
 try{
  await c.query('BEGIN READ ONLY');
  athletes=(await c.query('select athlete_id,full_name,gender,tfrrs_athlete_id from athletes where school_id=1835 and tfrrs_athlete_id is not null order by athlete_id')).rows;
  teams=(await c.query('select t.team_id,t.school_id,t.gender,t.tfrrs_team_url,t.team_name,s.official_name,s.short_name from teams t join schools s using(school_id)')).rows;
  await c.query('ROLLBACK');
 }finally{await c.end();}
 fs.writeFileSync(path.join(dir,'scope.json'),JSON.stringify({at:new Date().toISOString(),athletes,teams},null,2));
 const key=url=>String(url||'').match(/\/teams\/(?:tf|xc)\/([^/?]+?)(?:\.html)?(?:[?#]|$)/)?.[1]?.replace(/\.html$/,'').toLowerCase();
 const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const file=path.join(dir,'profiles.jsonl');
 const prior=fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 const completed=new Set(prior.filter(r=>r.status==='checked'||r.status==='no_team_link').map(r=>r.athlete_id));
 const pending=process.argv.includes('--summarize-only')?[]:athletes.filter(a=>!completed.has(a.athlete_id));let index=0,done=0,blocked=false;
 const worker=async()=>{while(index<pending.length&&!blocked){const a=pending[index++];let row;
  try{const url=`https://www.tfrrs.org/athletes/${encodeURIComponent(a.tfrrs_athlete_id)}`;const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if([403,429].includes(response.status))blocked=true;if(!response.ok)throw Error(`HTTP ${response.status}`);
   const $=cheerio.load(await response.text());
   const links=$('a[href*="/teams/"]').toArray().map(el=>({name:$(el).text().trim(),url:new URL($(el).attr('href'),url).href}));
   const unique=[...new Map(links.map(l=>[l.url,l])).values()];
   row={...a,source_url:response.url,status:unique.length?'checked':'no_team_link',teams:unique.map(l=>({...l,existing:teams.filter(t=>t.gender===a.gender&&(key(t.tfrrs_team_url)===key(l.url)||[t.team_name,t.official_name,t.short_name].some(n=>norm(n)===norm(l.name)))).map(t=>({team_id:t.team_id,school_id:t.school_id}))}))};
  }catch(e){row={...a,status:'fetch_error',error:e.message};}
  fs.appendFileSync(file,JSON.stringify(row)+'\n');done++;if(done%100===0)console.log(`${done}/${pending.length} profiles checked`);
  await new Promise(resolve=>setTimeout(resolve,800));
 }};await Promise.all([worker(),worker(),worker()]);
 const attempts=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const latest=new Map();for(const row of attempts)latest.set(row.athlete_id,row);
 const all=[...latest.values()];
 // Classify from the source team's gender: legacy athlete.gender itself may be NULL.
 // This is discovery only; never fill an athlete's gender or affiliation here.
 for(const a of all)for(const t of a.teams||[]){
  const sourceGender=t.url.match(/_(m|f)_/i)?.[1]?.toUpperCase();
  t.existing=teams.filter(x=>key(x.tfrrs_team_url)===key(t.url)||(x.gender===sourceGender&&[x.team_name,x.official_name,x.short_name].some(n=>norm(n)===norm(t.name)))).map(x=>({team_id:x.team_id,school_id:x.school_id}));
 }
 fs.writeFileSync(path.join(dir,'classified_profiles.json'),JSON.stringify(all,null,2));
 const groups=new Map();for(const a of all)for(const t of a.teams||[])if(!t.existing.length){const k=key(t.url)||t.url;if(!groups.has(k))groups.set(k,{source_team:t.name,source_url:t.url,athletes:[]});groups.get(k).athletes.push({athlete_id:a.athlete_id,name:a.full_name,tfrrs_athlete_id:a.tfrrs_athlete_id});}
 const summary={scoped_athletes:athletes.length,attempted:all.length,not_attempted:athletes.length-all.length,checked:all.filter(r=>r.status==='checked').length,fetch_errors:all.filter(r=>r.status==='fetch_error').length,no_team_link:all.filter(r=>r.status==='no_team_link').length,unmapped_source_teams:[...groups.values()].sort((a,b)=>b.athletes.length-a.athletes.length)};
 const sourceKind=url=>/_jcollege_[mf](?:_|\.)/i.test(url)?'junior_college':/_college_[mf](?:_|\.)/i.test(url)?'college':'scholastic_or_other';
 summary.source_namespace_breakdown={};
 for(const kind of ['college','junior_college','scholastic_or_other']){
  const rows=summary.unmapped_source_teams.filter(g=>sourceKind(g.source_url)===kind);
  summary.source_namespace_breakdown[kind]={team_urls:rows.length,athletes:new Set(rows.flatMap(g=>g.athletes.map(a=>a.athlete_id))).size};
 }
 const sourceCollegeIds=[...new Set(summary.unmapped_source_teams.filter(g=>sourceKind(g.source_url)!=='scholastic_or_other').flatMap(g=>g.athletes.map(a=>a.athlete_id)))];
 const statsClient=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:20000});await statsClient.connect();
 try{
  const stats=(await statsClient.query('select count(*)::int as results,count(*) filter(where team_id is null)::int as teamless_results,count(distinct athlete_id)::int as athletes_with_results from results where athlete_id=any($1::bigint[])',[sourceCollegeIds])).rows[0];
  summary.source_college_candidate_result_coverage=stats;
 }finally{await statsClient.end();}
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,unmapped_source_teams:summary.unmapped_source_teams.map(g=>({...g,athletes:g.athletes.length}))},null,2));
 if(process.argv.includes('--publish-summary')){
  const report={...summary,scope_note:'Only Unattached records with TFRRS IDs. Source profile associations are candidates; source results and school aliases must be reviewed before repair. Source namespace is not itself proof that an institution is collegiate.',unmapped_athletes:new Set(summary.unmapped_source_teams.flatMap(g=>g.athletes.map(a=>a.athlete_id))).size};
  fs.writeFileSync(path.join(__dirname,'missing_school_profile_audit_20260906.json'),JSON.stringify(report,null,2));
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

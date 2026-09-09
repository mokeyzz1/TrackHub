#!/usr/bin/env node
// Read-only candidate matching. Suggestions require review before any school/team write.
const fs=require('node:fs');const path=require('node:path');const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const review=require(process.argv[2]||'/tmp/collegiate-source-team-review-20260906/summary.json');
const rows=review.association_confirmed;
const schoolKey=url=>url.replace(/_(m|f)_/i,'_X_').replace(/_(m|f)\.html$/i,'_X.html');
const groups=new Map();for(const r of rows){const key=schoolKey(r.source_url);const g=groups.get(key)||{source_name:r.source_team,source_urls:[],associations:new Set(),athletes:new Map()};g.source_urls.push(r.source_url);for(const a of r.declared_associations)g.associations.add(a);for(const a of r.athletes)g.athletes.set(a.athlete_id,a);groups.set(key,g);}
const norm=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\b(university|college|community|of|the|at|state)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const grams=s=>{s=`  ${norm(s)}  `;const x=new Set();for(let i=0;i<s.length-2;i++)x.add(s.slice(i,i+3));return x};
const score=(a,b)=>{const x=grams(a),y=grams(b);let n=0;for(const z of x)if(y.has(z))n++;return 2*n/(x.size+y.size)};
async function main(){const c=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:20000});await c.connect();let schools,teams;try{await c.query('BEGIN READ ONLY');schools=(await c.query('select school_id,official_name,short_name,institution_type,division,division_id from schools')).rows;teams=(await c.query('select team_id,school_id,gender,team_name,tfrrs_team_url from teams')).rows;await c.query('ROLLBACK');}finally{await c.end();}
 const output=[];for(const g of groups.values()){const suggestions=schools.map(s=>({...s,score:Math.max(score(g.source_name,s.official_name),score(g.source_name,s.short_name))})).sort((a,b)=>b.score-a.score).slice(0,3);output.push({source_name:g.source_name,source_urls:g.source_urls,associations:[...g.associations],athletes:[...g.athletes.values()],suggestions,exact_existing_teams:teams.filter(t=>g.source_urls.includes(t.tfrrs_team_url))});}
 output.sort((a,b)=>b.athletes.length-a.athletes.length);fs.writeFileSync(process.argv[3]||'/tmp/collegiate-school-matches-20260906.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output.map(g=>({source:g.source_name,athletes:g.athletes.length,best:g.suggestions[0]})),null,2));}
main().catch(e=>{console.error(e.message);process.exitCode=1});

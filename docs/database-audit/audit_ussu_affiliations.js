#!/usr/bin/env node
// Read-only collection. Retains exact database before-images and public source HTML.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const cheerio = require('cheerio');
const env = require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed || {};
const ids = process.argv.includes('--women')
  ? [153183,153184,153187,153189]
  : [153161,153167,153168,153163,153166,153177,153164,161491,155806,153178,153179,153165,153159,153176,153174,153162];
const teamUrl = 'https://www.tfrrs.org/teams/tf/AL_college_m_United_States_Sports_Academy.html';
async function main() {
 const dir = fs.mkdtempSync(process.argv.includes('--women')?'/tmp/ussu-women-affiliations-':'/tmp/ussu-affiliations-');
 const client = new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:20000});
 await client.connect();
 try {
  await client.query('BEGIN READ ONLY');
  const athletes = (await client.query('select * from athletes where athlete_id=any($1::bigint[]) order by athlete_id',[ids])).rows;
  const results = (await client.query('select * from results where athlete_id=any($1::bigint[]) order by result_id',[ids])).rows;
  const meets = (await client.query('select * from meets where meet_id=any($1::int[])',[ [...new Set(results.map(r=>r.meet_id).filter(Boolean))] ])).rows;
  fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify({athletes,results,meets},null,2));
  await client.query('ROLLBACK');
 } finally {await client.end();}
 const response = await fetch(teamUrl); if(!response.ok) throw Error(`HTTP ${response.status}`);
 const html = await response.text(); fs.writeFileSync(path.join(dir,'team.html'),html);
 const $ = cheerio.load(html);
 const links = $('a[href]').toArray().map(a=>({name:$(a).text().trim(),url:new URL($(a).attr('href'),teamUrl).href}));
 fs.writeFileSync(path.join(dir,'links.json'),JSON.stringify(links.filter(a=>/\/(athletes|results|all_performances)\//.test(a.url)),null,2));
 const sourceIds = [92628,93602,96024,95245,92708,94939,96649,95542];
 for (const id of sourceIds) {
  const url = `https://www.tfrrs.org/results/${id}`;
  const resp = await fetch(url); if(!resp.ok) throw Error(`HTTP ${resp.status}: ${url}`);
  fs.writeFileSync(path.join(dir,`${id}.html`),await resp.text());
 }
 console.log(JSON.stringify({directory:dir,sourceMeetCount:sourceIds.length},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

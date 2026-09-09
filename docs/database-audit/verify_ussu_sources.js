#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const cheerio=require('cheerio');
async function main(){
 const dir=process.argv[2]; const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json')));
 const sourceMap={11980:92628,12012:93602,12102:96024,12366:95245,12433:92708,12563:94939,12634:96649,12888:95542};
 const athletes=new Map(before.athletes.map(a=>[a.athlete_id,a]));
 const cache=new Map(); const review=[];
 for(const r of before.results){
  if(r.team_id!==null)continue;
  const sourceMeet=sourceMap[r.meet_id];
  const $meet=cheerio.load(fs.readFileSync(path.join(dir,`${sourceMeet}.html`)));
  // This historical row points to an obsolete event ID; exact athlete/mark still required.
  const sourceEvent=r.result_id==='6745334'?5862492:r.event_id;
  const link=$meet(`a[href*="/${sourceEvent}/"]`).first().attr('href');
  if(!link){review.push({result_id:r.result_id,status:'missing_event_link'});continue;}
  const url=new URL(link,'https://www.tfrrs.org').href;
  if(!cache.has(url)){
   const response=await fetch(url);if(!response.ok)throw Error(`HTTP ${response.status}`);
   const html=await response.text();fs.writeFileSync(path.join(dir,`event-${r.event_id}.html`),html);cache.set(url,html);
  }
  const $=cheerio.load(cache.get(url));
  const hidden=new Set();$('style').each((_,s)=>{for(const m of $(s).text().matchAll(/\.([\w-]+)\s*\{\s*display:\s*none/g))hidden.add(m[1]);});
  const id=athletes.get(r.athlete_id).tfrrs_athlete_id;
  const rows=$('table tbody tr').toArray().filter(tr=>$(tr).find(`a[href*="/athletes/${id}/"]`).length);
  const evidence=rows.map(tr=>({team:$(tr).find('a[href*="/teams/"]').first().text().trim(),team_url:$(tr).find('a[href*="/teams/"]').first().attr('href'),cells:$(tr).find('td').toArray().filter(td=>!String($(td).attr('class')||'').split(/\s+/).some(c=>hidden.has(c))).map(td=>$(td).text().trim().replace(/\s+/g,' '))}));
  const match=evidence.find(e=>e.team==='USSU'&&/AL_college_[mf]_United_States_Sports_Academy/.test(e.team_url)&&e.cells.includes(r.mark_raw));
  review.push({result_id:r.result_id,athlete_id:r.athlete_id,source_athlete_id:id,event_id:r.event_id,source_url:url,mark:r.mark_raw,status:match?'verified':'needs_review',evidence:match||evidence});
 }
 fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(review,null,2));
 console.log(JSON.stringify({verified:review.filter(r=>r.status==='verified').length,total:review.length,unresolved:review.filter(r=>r.status!=='verified')},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

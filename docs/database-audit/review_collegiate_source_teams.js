#!/usr/bin/env node
// Read-only source-team review. Uses TFRRS metadata to refine candidates; makes no DB writes.
const fs=require('node:fs');const path=require('node:path');const cheerio=require('cheerio');
const source=path.join(__dirname,'missing_school_profile_audit_20260906.json');
const output=process.argv[2]||'/tmp/collegiate-source-team-review-20260906';fs.mkdirSync(output,{recursive:true});
const audit=require(source);
const candidates=audit.unmapped_source_teams.filter(g=>/_jcollege_[mf](?:_|\.)/i.test(g.source_url)||/_college_[mf](?:_|\.)/i.test(g.source_url));
const cacheFile=path.join(output,'teams.jsonl');
const prior=fs.existsSync(cacheFile)?fs.readFileSync(cacheFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const done=new Set(prior.filter(r=>r.status==='checked').map(r=>r.source_url));let cursor=0,blocked=false;
const pending=process.argv.includes('--summarize-only')?[]:candidates.filter(g=>!done.has(g.source_url));
const associations=['NCAA DI','NCAA DII','NCAA DIII','NAIA','NJCAA','CCCAA','USCAA','NCCAA','U SPORTS','NWAC','CCAA','CIAU','RSEQ','OUA','CCAC'];
async function worker(){while(cursor<pending.length&&!blocked){const g=pending[cursor++];let row;
 try{const response=await fetch(g.source_url,{signal:AbortSignal.timeout(15000)});if([403,429].includes(response.status))blocked=true;if(!response.ok)throw Error(`HTTP ${response.status}`);const html=await response.text();const $=cheerio.load(html);const body=$('body').text().replace(/\s+/g,' ').trim();
  const declared=associations.filter(a=>new RegExp(`\\b${a.replace(' ','\\s*')}\\b`,'i').test(body));
  const explicitClub=/\b(run(?:ning)? club|track club|club team)\b/i.test(`${g.source_team} ${body.slice(0,1500)}`);
  row={source_team:g.source_team,source_url:g.source_url,athletes:g.athletes,status:'checked',page_title:$('title').text().trim(),declared_associations:declared,explicit_club:explicitClub};
 }catch(e){row={source_team:g.source_team,source_url:g.source_url,athletes:g.athletes,status:'fetch_error',error:e.message};}
 fs.appendFileSync(cacheFile,JSON.stringify(row)+'\n');await new Promise(r=>setTimeout(r,650));}}
async function main(){await Promise.all([worker(),worker()]);const attempts=fs.readFileSync(cacheFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);const latest=new Map();for(const r of attempts)latest.set(r.source_url,r);const rows=[...latest.values()];
 const reviewed={source_candidates:candidates.length,checked:rows.filter(r=>r.status==='checked').length,fetch_errors:rows.filter(r=>r.status==='fetch_error').length,explicit_clubs:rows.filter(r=>r.explicit_club),association_confirmed:rows.filter(r=>(r.declared_associations||[]).length&&!r.explicit_club),association_unresolved:rows.filter(r=>r.status==='checked'&&!(r.declared_associations||[]).length&&!r.explicit_club)};
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(reviewed,null,2));console.log(JSON.stringify({source_candidates:reviewed.source_candidates,checked:reviewed.checked,fetch_errors:reviewed.fetch_errors,explicit_clubs:reviewed.explicit_clubs.map(r=>r.source_team),association_confirmed:reviewed.association_confirmed.length,association_unresolved:reviewed.association_unresolved.map(r=>r.source_team)},null,2));}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

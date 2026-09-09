#!/usr/bin/env node
// Defaults to rollback rehearsal. --commit restores exact archived athlete rows.
const assert=require('node:assert/strict');
const path=require('node:path');
const {Client}=require('pg');
const env=require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true}).parsed||{};
const operation='20260907_remaining_collegiate_profile_repair';
const commit=process.argv.includes('--commit');

async function main(){
  const client=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.hunbahsnaeeztmzqpnrl',password:env.DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},statement_timeout:60000});
  await client.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('select pg_advisory_xact_lock(hashtext($1))',[operation]);
    const archive=(await client.query("select source_pk,row_data from ingest.fact_cleanup_archive where operation_key=$1 and source_table='public.athletes' order by source_pk::bigint for update",[operation])).rows;
    assert.equal(archive.length,178);
    assert.equal(new Set(archive.map(row=>row.source_pk)).size,178);
    assert(archive.every(row=>String(row.row_data.school_id)==='1835'));
    const ids=archive.map(row=>row.source_pk);
    const current=(await client.query('select athlete_id,school_id from athletes where athlete_id=any($1::bigint[]) for update',[ids])).rows;
    assert.equal(current.length,178);
    assert(current.every(row=>String(row.school_id)!=='1835'),'A repaired profile has diverged or already been restored');
    const result=await client.query(`
      update public.athletes athlete
      set school_id=(archive.row_data->>'school_id')::bigint,
          updated_at=(archive.row_data->>'updated_at')::timestamptz
      from ingest.fact_cleanup_archive archive
      where archive.operation_key=$1 and archive.source_table='public.athletes'
        and athlete.athlete_id=archive.source_pk::bigint
    `,[operation]);
    assert.equal(result.rowCount,178);
    assert.equal((await client.query('select count(*)::int n from athletes where athlete_id=any($1::bigint[]) and school_id=1835',[ids])).rows[0].n,178);
    if(commit)await client.query('delete from ingest.fact_cleanup_archive where operation_key=$1',[operation]);
    await client.query(commit?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({operation,rollback_committed:commit,profiles_restored:178,archive_removed:commit},null,2));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { repo, raw, generated, origin, run, localDatabase, showError, sleep } from './common.mjs';
import { seed } from './fixtures.mjs';

export async function setup() {
  await mkdir(raw,{recursive:true});await mkdir(generated,{recursive:true});
  const file=join(raw,'session.json');
  if(await access(file).then(()=>true,()=>false)) { const saved=JSON.parse(await readFile(file,'utf8'));localDatabase(saved.databaseUrl);return saved; }
  const name='roll_rewards_qa_tutorial_'+Date.now()+'_'+randomBytes(3).toString('hex');
  const databaseUrl=`postgresql://eric@127.0.0.1:5432/${name}`;localDatabase(databaseUrl);
  await run('createdb',['--host=127.0.0.1','--username=eric',name]);
  await run('pg_dump',['--host=127.0.0.1','--username=eric','--schema-only','--no-owner','--no-privileges','--file='+join(raw,'schema.sql'),'roll_rewards_qa_crons_20261115']);
  await run('psql',[databaseUrl,'--set=ON_ERROR_STOP=1','--file='+join(raw,'schema.sql')],{quiet:true});
  const password='Demo-only-'+randomBytes(12).toString('base64url');
  const session={databaseUrl,password,authSecret:randomBytes(32).toString('hex'),...await seed(databaseUrl,password)};
  await writeFile(file,JSON.stringify(session,null,2),{mode:0o600});return session;
}

export async function ownedServer(session) {
  if(!Number.isSafeInteger(session.serverPid)||session.serverPid<=0)return false;
  const command=await run('ps',['-p',String(session.serverPid),'-o','command='],{quiet:true}).catch(()=> '');
  const files=await run('lsof',['-a','-p',String(session.serverPid),'-d','cwd,1,2','-Fn'],{quiet:true}).catch(()=> '');
  return (command.includes('next-server')||command.includes(join(repo,'node_modules/next/dist/bin/next')))&&files.split('\n').includes('n'+repo)&&files.split('\n').includes('n'+join(raw,'server.log'));
}

export async function start(session, rebuild=false) {
  localDatabase(session.databaseUrl);
  assert.ok(!await fetch(origin+'/login').then(()=>true,()=>false),'Tutorial port 3127 is in use; refusing to reuse an unknown app server');
  const env={...process.env,DATABASE_URL:session.databaseUrl,ROLL_LOCAL_POSTGRES:'true',AUTH_SECRET:session.authSecret,NEXT_PUBLIC_APP_URL:origin,MEMBER_NETWORK_ENABLED:'true',MEMBER_NETWORK_EMAIL_ENABLED:'false',ANTHROPIC_API_KEY:'qa-disabled',ANTHROPIC_BASE_URL:'http://127.0.0.1:1',RESEND_API_KEY:'',OMRADE_API_KEY:'',OMRADE_ENABLED:'false',OMRADE_WORKER_ENABLED:'false',PAYPAL_CLIENT_SECRET:'',PAYPAL_CLIENT_ID:'',INVESTOR_BLOB_READ_WRITE_TOKEN:'',NEXT_PUBLIC_UMAMI_ENABLED:'false'};
  if(rebuild||!await access(join(repo,'.next/BUILD_ID')).then(()=>true,()=>false))await run(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'build','--webpack'],{env});
  const log=openSync(join(raw,'server.log'),'a');
  const child=spawn(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'start','--hostname','localhost','--port','3127'],{cwd:repo,detached:true,stdio:['ignore',log,log],env});
  closeSync(log);child.unref();session.serverPid=child.pid;await writeFile(join(raw,'session.json'),JSON.stringify(session,null,2),{mode:0o600});
  for(let i=0;i<120;i++){try{const response=await fetch(origin+'/login');if(response.ok)return;}catch{}await sleep(1000);}
  throw new Error('Local tutorial app failed to start.\n'+await readFile(join(raw,'server.log'),'utf8'));
}

async function main() {
  const mode=process.argv[2]||'all';
  if(mode==='all'&&await access(join(raw,'session.json')).then(()=>true,()=>false)){
    const previous=JSON.parse(await readFile(join(raw,'session.json'),'utf8'));localDatabase(previous.databaseUrl);
    if(await ownedServer(previous))try{process.kill(-previous.serverPid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
    await mkdir(join(raw,'sessions'),{recursive:true});await rename(join(raw,'session.json'),join(raw,'sessions',Date.now()+'.json'));await sleep(1000);
  }
  const session=await setup();
  if(mode==='setup') { console.log('Created isolated tutorial database and fictional accounts.');return; }
  if(mode==='server') {await start(session);console.log('Tutorial app ready at '+origin);return;}
  if(mode==='all')await start(session,true);
  else if(!await fetch(origin+'/login').then(r=>r.ok,()=>false))await start(session);
  else assert.ok(await ownedServer(session),'Refusing to capture from an app server outside this tutorial session');
  const {capture}=await import('./record.mjs');await capture(session,mode);
}
if(process.argv[1]===new URL(import.meta.url).pathname)main().catch(async error=>{console.error(error);await showError(error);process.exitCode=1;});

import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile,access,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {dir,repo,raw,generated,renders,run,binary,renderEnvironment,showError} from './common.mjs';
import {chapters,duration,fps} from './chapters.mjs';
import {writeScore} from '../nova-intro/score.mjs';
const mode=process.argv[2]||'preview',output=join(renders,'nova-ai-client-tutorial-en.mp4');
const exists=p=>access(p).then(()=>true,()=>false);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=s=>{const ms=Math.round(s*1000);return[Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
export function wrap(text){const lines=[];for(const p of text.split('\n')){let line='';for(const word of p.split(' ')){if((line+' '+word).trim().length>68){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);}assert.ok(lines.length<=2,'Caption exceeds two lines: '+text);return lines;}
export function schedule(records){
 assert.equal(chapters.reduce((n,c)=>n+c.duration,0),duration);
 return chapters.flatMap(c=>{
  const events=records[c.id].events,base=events.map(e=>Math.max(4,e.out-e.in+.85)),minimum=base.reduce((a,b)=>a+b,0),weight=events.reduce((n,e)=>n+e.hold,0);
  assert.ok(minimum<=c.duration,`Chapter ${c.id} exceeds its budget; shorten loading waits and re-record. ${minimum}/${c.duration}`);
  let used=0,cumulative=0;
  return events.map((e,i)=>{cumulative+=base[i]+(c.duration-minimum)*e.hold/weight;const end=i===events.length-1?c.duration*fps:Math.round(cumulative*fps),count=end-used;assert.ok(count>=fps*4);const next={...e,chapter:c.id,title:c.title,index:i,start:c.start+used/fps,duration:count/fps,frames:count,lines:wrap(e.caption)};used=end;return next;});
 });
}
async function prepare(){
 await mkdir(generated,{recursive:true});await mkdir(renders,{recursive:true});
 await copyFile(join(repo,'node_modules/gsap/dist/gsap.min.js'),join(generated,'gsap.min.js'));
 for(const color of ['white','black'])await copyFile(join(repo,`public/nova/logo-${color}.png`),join(generated,`logo-${color}.png`));
 if(!await exists(join(generated,'inter.woff2'))||(await readFile(join(generated,'inter.woff2'))).toString('ascii',0,4)!=='wOF2'){const r=await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@500..800&display=block',{headers:{'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'}});assert.ok(r.ok);const urls=[...(await r.text()).matchAll(/url\((https:[^)]+)\)/g)];assert.ok(urls.length);const font=await fetch(urls.at(-1)[1]);assert.ok(font.ok);await writeFile(join(generated,'inter.woff2'),Buffer.from(await font.arrayBuffer()));}
 if(!await exists(join(generated,'score.wav'))){await writeScore(join(generated,'score-short.wav'));await run('ffmpeg',['-y','-v','error','-stream_loop','-1','-i',join(generated,'score-short.wav'),'-t','900','-af','volume=0.22,afade=t=in:d=2,afade=t=out:st=897:d=3','-ar','48000','-ac','2',join(generated,'score.wav')]);}
 const records={};for(const c of chapters){assert.ok(await exists(join(raw,c.id+'.json')),'Capture chapter first: '+c.id);records[c.id]=JSON.parse(await readFile(join(raw,c.id+'.json'),'utf8'));assert.equal(records[c.id].id,c.id);assert.equal(records[c.id].errors.length,0,c.id+' browser errors: '+records[c.id].errors.join('\n'));}
 const events=schedule(records);await writeFile(join(generated,'timeline.json'),JSON.stringify(events,null,2));
 await writeFile(join(renders,'nova-ai-client-tutorial-en.srt'),events.map((e,i)=>`${i+1}\n${stamp(e.start)} --> ${stamp(e.start+e.duration)}\n${e.lines.join('\n')}\n`).join('\n'));
 await run('pdftoppm',['-f','1','-singlefile','-scale-to','1500','-png',join(raw,'nova-demo-validation-report.pdf'),join(generated,'report')],{quiet:true});
 await writeFile(join(generated,'status.js'),'// Production inputs verified.\n');return events;
}
async function conform(events){
 const clips=[],hashes={};let changed=false;
 for(const e of events){
  const file=join(generated,`${e.chapter}-${e.index}.mp4`),source=join(raw,e.chapter+'.webm');
  hashes[source]??=createHash('sha256').update(await readFile(source)).digest('hex');
  const hash=createHash('sha256').update(hashes[source]+JSON.stringify(e)+'conform-v6').digest('hex'),hashfile=file+'.sha256';
  if(await exists(file)&&await exists(hashfile)&&(await readFile(hashfile,'utf8'))===hash){clips.push(file);continue;}
  changed=true;const m=JSON.parse(await run('ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',source],{quiet:true})),{width,height}=m.streams[0];let crop='';
  if(e.focus&&width===1920&&!e.card){const cw=1152,ch=488,x=Math.round(Math.min(width-cw,Math.max(0,e.focus.x-cw/2))/2)*2,y=Math.round(Math.min(height-ch,Math.max(0,e.focus.y-ch*.48))/2)*2;crop=`crop=${cw}:${ch}:${x}:${y},`;}
  const fit=crop?crop+'scale=1920:812:flags=lanczos,pad=1920:1080:0:88:color=0x17191f':'scale=-2:812,pad=1920:1080:(ow-iw)/2:88:color=0x17191f';
  const take=e.out-e.in;assert.ok(e.duration>=take+.8,'Keep the saved-state reading hold');const args=['-y','-v','error'];
  // Actual operations stay at 1×; the recorded 1.2s feedback plus padding gives at least two seconds to read the result.
  if(e.card==='NOVA AI'){const metal=join(repo,'videos/nova-intro/assets/generated',e.chapter==='mobile'?'metal-outro.mp4':'metal-intro.mp4');assert.ok(await exists(metal),'Run pnpm video:prepare for existing Remotion / Three.js assets');args.push('-i',metal,'-vf',`scale=1920:1080,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${e.duration}`);}

  else if(width<800){const cy=Math.round(Math.min(height-390,Math.max(0,(e.focus?.y||195)-195))/2)*2;args.push('-ss',String(e.in),'-t',String(take),'-i',source,'-filter_complex',`[0:v]setpts=PTS-STARTPTS,fps=30,split[m][z];[m]scale=-2:812,pad=1920:1080:290:88:color=0x17191f[bg];[z]crop=390:390:0:${cy},scale=780:780:flags=lanczos[zoom];[bg][zoom]overlay=930:104,scale=1920:1080,setsar=1,tpad=stop_mode=clone:stop_duration=${e.duration}[v]`,'-map','[v]');}
  else args.push('-ss',String(e.in),'-t',String(take),'-i',source,'-vf',`setpts=PTS-STARTPTS,fps=30,${fit},setsar=1,tpad=stop_mode=clone:stop_duration=${e.duration}`);
  args.push('-an','-frames:v',String(e.frames),'-r','30','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',file);await run('ffmpeg',args,{quiet:true});await writeFile(hashfile,hash);clips.push(file);console.log('Conformed '+e.chapter+' / '+(e.index+1));
 }
 if(!changed&&await exists(join(generated,'footage.mp4'))&&await exists(join(generated,'footage-cfr-v1')))return;
 await writeFile(join(generated,'concat.txt'),clips.map(p=>`file '${p.replaceAll("'","'\\''")}'`).join('\n'));await run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',join(generated,'concat.txt'),'-an','-vf','setsar=1','-c:v','libx264','-preset','veryfast','-crf','17','-r','30','-g','30','-keyint_min','30','-sc_threshold','0','-frames:v','27000','-pix_fmt','yuv420p','-movflags','+faststart',join(generated,'footage-next.mp4')],{quiet:true});await rename(join(generated,'footage-next.mp4'),join(generated,'footage.mp4'));await writeFile(join(generated,'footage-cfr-v1'),'30fps · one-second GOP');
}
function map(){return `<p class="eyebrow">FIVE MILESTONES · SIXTEEN STEPS</p><h1>Evidence becomes a clear next action.</h1><div class="map">${[['01 · Target customer','Customer conversations','Positioning','Qualification criteria','Customer tiers'],['02 · Paid pilot','Pilot proposal','Payment evidence','Offer and terms'],['03 · Repeatable outreach','Four-week outreach','Channel selection','Sales process'],['04 · Customer outcomes','Paid customers','Customer review','Revenue and acquisition cost'],['05 · Scale with evidence','Revenue target','Second-market validation','Validation report']].map(g=>`<section><h2>${g[0]}</h2>${g.slice(1).map(t=>`<p>${t}</p>`).join('')}</section>`).join('')}</div>`;}
async function html(events){
 const rows=events.map(e=>`<article id="step-${e.chapter}-${e.index}" class="step" data-step-start="${e.start}" data-step-duration="${e.duration}" data-layout-ignore><header><span>${String(chapters.findIndex(c=>c.id===e.chapter)+1).padStart(2,'0')} / ${escape(e.title)}</span><small>${escape(e.label)} · ${escape(e.actor.toUpperCase())}</small></header>${e.card?`<div class="card ${e.card==='NOVA AI'?'brand':''}">${e.card==='map'?map():e.card==='pdf'?'<img class="paper" src="assets/generated/report.png" alt="Actual Chromium print output">':e.card==='NOVA AI'?'<div class="brand-logo" role="img" aria-label="NOVA AI"></div><p>CLIENT WALKTHROUGH</p>':`<p class="eyebrow">NOVA AI · CLIENT GUIDE</p><h1>${escape(e.card)}</h1><div class="rule"></div><p class="card-note">${escape(e.label)}</p>`}</div>`:''}<footer><span class="number">${String(e.index+1).padStart(2,'0')}</span><p class="caption">${e.lines.map(escape).join('<br>')}</p></footer></article>`).join('\n');
 const js=`const tutorialEvents=${JSON.stringify(events.map(e=>({id:`step-${e.chapter}-${e.index}`,start:e.start,end:e.start+e.duration})))};const tl=gsap.timeline({paused:true});for(const e of tutorialEvents){tl.set('#'+e.id,{autoAlpha:1},e.start);tl.set('#'+e.id,{autoAlpha:0},e.end);tl.fromTo('#'+e.id+' .caption',{y:12,opacity:0},{y:0,opacity:1,duration:.22,ease:'power2.out',immediateRender:false},e.start);tl.fromTo('#'+e.id+' .number',{scale:.9,opacity:.5},{scale:1,opacity:1,duration:.25,immediateRender:false},e.start);const card=document.querySelector('#'+e.id+' .card');if(card)tl.fromTo(card,{y:18,opacity:0},{y:0,opacity:1,duration:.3,immediateRender:false},e.start);}window.__timelines=window.__timelines||{};window.__timelines.annotations=tl;`;
 await writeFile(join(generated,'overlay.html'),`<template><div id="root" data-composition-id="annotations" data-width="1920" data-height="1080" data-duration="900">${rows}</div><script>${js}</script></template>`);
 await writeFile(join(generated,'steps.js'),"window.__timelines=window.__timelines||{};window.__timelines['nova-tutorial']=gsap.timeline({paused:true});");
 await writeFile(join(dir,'index.html'),await readFile(join(dir,'template.html.tpl'),'utf8'));
}
function errorPreview(error){return `<!doctype html><html lang="en"><meta charset="utf-8"><title>NOVA tutorial · production error</title><div id="root" data-composition-id="nova-tutorial-error" data-duration="900" data-width="1920" data-height="1080" style="width:1920px;height:1080px;background:#fff1f1;color:#841d1d;padding:28px;overflow:auto;box-sizing:border-box"><h1>Complete production error</h1><pre role="alert" style="font:24px/1.4 monospace;white-space:pre-wrap;overflow-wrap:anywhere">${escape(error.stack||String(error))}</pre></div></html>`;}
assert.ok(errorPreview(new Error('Missing <asset>')).includes('Missing &lt;asset&gt;'));
async function trimEncoderPadding(){
 const data=JSON.parse(await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,avg_frame_rate','-of','json',output],{quiet:true})),v=data.streams[0],frames=Number(v.nb_frames);
 assert.equal(v.avg_frame_rate,'30/1');assert.ok(frames>=duration*fps&&frames<=duration*fps+2,'Unexpected HyperFrames encoder frame count');
 // Native video layers can append two encoder padding frames; remux without changing image or audio samples.
 const trimmed=output+'.trim.mp4';await run('ffmpeg',['-y','-v','error','-i',output,'-map','0:v:0','-map','0:a:0','-t',String(duration),'-frames:v',String(duration*fps),'-c','copy','-movflags','+faststart',trimmed],{quiet:true});await rename(trimmed,output);
}
async function main(){assert.ok(['prepare','preview','render','check'].includes(mode));const events=await prepare();if(['prepare','render','preview'].includes(mode)){await conform(events);await html(events);}if(mode==='prepare')return;if(mode==='preview'){await run(binary('hyperframes'),['preview',dir,'--port=4311','--background']);return;}await run(binary('hyperframes'),['lint',dir]);if(mode==='render'){await run(binary('hyperframes'),['render',dir,'--output',output,'--fps=30','--quality=looks','--sdr','--workers=1','--no-browser-gpu','--no-best-effort','--video-frame-format=png'],{env:await renderEnvironment()});await trimEncoderPadding();await run('ffmpeg',['-y','-v','error','-ss','2','-i',output,'-frames:v','1','-q:v','2',join(renders,'nova-ai-client-tutorial-cover.jpg')],{quiet:true});}const {check}=await import('./check.mjs');await check(events,output);}
if(process.argv[1]===new URL(import.meta.url).pathname)main().catch(async error=>{console.error(error);await showError(error);if(mode==='preview'){await writeFile(join(dir,'index.html'),errorPreview(error));await run(binary('hyperframes'),['preview',dir,'--port=4311','--background']).catch(error=>console.error(error));}process.exitCode=1;});

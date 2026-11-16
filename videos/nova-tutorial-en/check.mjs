import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {dir,renders,raw,generated,run,binary,requireTool,chrome,localDatabase,renderEnvironment} from './common.mjs';
import {chapters,duration,fps} from './chapters.mjs';
import {wrap,schedule} from './video.mjs';

export function selfCheck(){
 assert.throws(()=>localDatabase('postgresql://user@database.example.com/roll_rewards_qa_tutorial_x'));
 assert.throws(()=>localDatabase('postgresql://eric@localhost/roll_rewards_qa_crons_20261115'));
 assert.throws(()=>localDatabase('https://localhost/roll_rewards_qa_tutorial_x'));
 assert.equal(localDatabase('postgresql://eric@127.0.0.1/roll_rewards_qa_tutorial_x').hostname,'127.0.0.1');
 assert.deepEqual(wrap('One instruction.\nOne clear result.'),['One instruction.','One clear result.']);
 assert.throws(()=>wrap('word '.repeat(80)));
 const fake=Object.fromEntries(chapters.map(c=>[c.id,{events:[{caption:'One clear instruction.',in:0,out:1.5,hold:1}]}]));
 const test=schedule(fake);assert.equal(test.length,11);assert.equal(test.at(-1).start+test.at(-1).duration,duration);
 fake.intro.events[0].out=60;assert.throws(()=>schedule(fake));
 return 8;
}
export async function seekCheck(){
 const server=createServer(async(req,res)=>{
  try{const path=new URL(req.url,'http://localhost').pathname;assert.ok(!decodeURIComponent(path).includes('..'));const file=join(dir,path==='/'?'index.html':decodeURIComponent(path));const data=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.woff2')?'font/woff2':file.endsWith('.png')?'image/png':file.endsWith('.mp4')?'video/mp4':'text/html');res.end(data);}catch(error){res.writeHead(404);res.end(error.message);}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {default:puppeteer}=requireTool('puppeteer-core');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu-compositing','--disable-partial-raster']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1920,height:1080});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle2'});await page.evaluate(()=>document.fonts.ready);
  // Exercise the authored GSAP layer independently; media seeking is HyperFrames' responsibility.
  await page.evaluate(async()=>{document.getElementById('footage').style.visibility='hidden';const text=await(await fetch('assets/generated/overlay.html')).text(),doc=new DOMParser().parseFromString(text,'text/html'),template=doc.querySelector('template'),script=template.content.querySelector('script').textContent;template.content.querySelector('script').remove();document.getElementById('annotations').append(template.content.cloneNode(true));Function(script)();});
  await page.waitForNetworkIdle({idleTime:500});
  const snapshot=async time=>{await page.evaluate(time=>{window.__timelines.annotations.time(time,false);},time);return createHash('sha256').update(await page.screenshot()).digest('hex');};
  for(const time of [1,127,330,521,684,806,895]){const first=await snapshot(time);await snapshot(899-time);assert.equal(await snapshot(time),first,'Random seek changed the same-time annotation frame at '+time);}
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('.caption')].filter(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().bottom>1080).map(e=>e.textContent));assert.deepEqual(overflow,[],'Caption clipping');
  assert.deepEqual(await page.evaluate(()=>window.novaErrors),[]);
  assert.ok(await page.evaluate(()=>document.fonts.check('600 40px Inter')),'Local English font must load');
  await page.evaluate(()=>document.getElementById('footage').style.visibility='visible');
  for(const time of [2,132,520,685,875]){
    await page.evaluate(async time=>{window.__timelines.annotations.time(time,false);const video=document.getElementById('footage');await new Promise((resolve,reject)=>{video.addEventListener('seeked',resolve,{once:true});video.addEventListener('error',reject,{once:true});video.currentTime=time;});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},time);
    await page.screenshot({path:join(renders,'preview-'+time+'.png')});
  }
  return 7;
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
export async function check(events,output){
 const checks={selfChecks:selfCheck(),chapters:chapters.length,instructions:events.length};let end=0;
 for(const e of events){assert.ok(Math.abs(e.start-end)<.001,'Timeline gap or overlap');assert.ok(e.duration>=4);assert.ok(e.duration>=e.out-e.in+.8);assert.ok(e.lines.length<=2);end=e.start+e.duration;await access(join(generated,`${e.chapter}-${e.index}.mp4`));}
 assert.equal(Math.round(end*fps),27000);
 const cues=(await readFile(join(renders,'nova-ai-client-tutorial-en.srt'),'utf8')).trim().split(/\n\n/).map(s=>s.split('\n'));assert.equal(cues.length,events.length);let previous=0;
 const seconds=s=>{assert.match(s,/^\d{2}:\d{2}:\d{2},\d{3}$/);const [h,m,n,ms]=s.split(/[:,]/).map(Number);return h*3600+m*60+n+ms/1000;};
 cues.forEach(([number,timing,...lines],i)=>{assert.equal(Number(number),i+1);const [start,stop]=timing.split(' --> ').map(seconds);assert.ok(Math.abs(start-previous)<.001&&stop-start>=4,'SRT gap, overlap or short instruction');assert.deepEqual(lines,events[i].lines);previous=stop;});assert.equal(previous,duration);checks.subtitleCues=cues.length;
 const index=await readFile(join(dir,'index.html'),'utf8');assert.ok(index.includes('data-duration="900"'));
 for(const [,src]of index.matchAll(/src="([^"]+)"/g)){assert.ok(src.startsWith('assets/'),'External media in film');await access(join(dir,src));}
 const face=requireTool('fontkit').create(await readFile(join(generated,'inter.woff2')));
 const missing=[...new Set(events.map(e=>e.caption).join(''))].filter(c=>!/[\s]/.test(c)&&!face.hasGlyphForCodePoint(c.codePointAt(0)));assert.deepEqual(missing,[],'English caption font glyphs');
 const metadata=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{quiet:true}));const v=metadata.streams.find(s=>s.codec_type==='video'),a=metadata.streams.find(s=>s.codec_type==='audio');
 assert.equal(v.width,1920);assert.equal(v.height,1080);assert.equal(v.sample_aspect_ratio,'1:1');assert.equal(v.avg_frame_rate,'30/1');assert.equal(v.codec_name,'h264');assert.equal(v.pix_fmt,'yuv420p');assert.equal(Number(v.nb_frames),27000);assert.ok(Math.abs(Number(v.duration)-900)<1/30);assert.equal(a.codec_name,'aac');
 const decoded=await run('ffmpeg',['-v','error','-xerror','-i',output,'-progress','pipe:1','-nostats','-f','null','-'],{quiet:true});assert.equal(Number([...decoded.matchAll(/frame=(\d+)/g)].at(-1)?.[1]),27000,'All frames must actually decode');
 const sharp=requireTool('sharp');
 for(const time of [2,180,520,685,875,899]){
  const file=join(renders,'final-'+time+'.png');await run('ffmpeg',['-y','-v','error','-ss',String(time),'-i',output,'-frames:v','1',file],{quiet:true});
  const sample=await sharp(await sharp(file).extract({left:80,top:1050,width:1760,height:20}).toBuffer()).stats();
  [16,18,23].forEach((expected,i)=>assert.ok(Math.abs(sample.channels[i].mean-expected)<6,'Exported footer is clipped at '+time+'s'));
 }
 checks.footerFrames=6;
 const black=await run('ffmpeg',['-v','info','-i',output,'-vf','blackdetect=d=0.5:pix_th=0.02','-an','-f','null','-'],{quiet:true,captureStderr:true});assert.ok(!black.includes('black_start:'),'Unexpected black interval');
 const sound=await run('ffmpeg',['-v','info','-i',output,'-vn','-af','volumedetect','-f','null','-'],{quiet:true,captureStderr:true});const peak=Number(sound.match(/max_volume: ([\d.-]+) dB/)?.[1]);assert.ok(Number.isFinite(peak)&&peak<-3,'Audio must remain below clipping');checks.audioPeakDb=peak;
 const strict=await run(binary('hyperframes'),['check',dir,'--json','--strict','--no-cache','--at='+chapters.map(c=>c.start+Math.min(2,c.duration/2)).join(','),'--at-transitions','--max-transition-samples=80','--budget=8m','--snapshots'],{quiet:true,env:await renderEnvironment()});await writeFile(join(renders,'hyperframes-check.json'),strict);const report=JSON.parse(strict);assert.equal(report.ok,true,'HyperFrames strict failed');
 checks.seekFrames=await seekCheck();Object.assign(checks,{width:v.width,height:v.height,fps:30,frames:27000,seconds:Number(v.duration),fullDecode:true,blackIntervals:0,audio:a.codec_name});
 const manifests=await Promise.all(chapters.map(c=>readFile(join(raw,c.id+'.json'),'utf8').then(JSON.parse)));checks.workflowAssertions=[...new Set(manifests.flatMap(m=>m.checks))];
 await writeFile(join(renders,'verification.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));return checks;
}
if(process.argv[1]===new URL(import.meta.url).pathname)console.log('Source self-checks:',selfCheck());

#!/usr/bin/env node
// Real upload helper compiled locally; canvas, images and network are all synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const frontend = Module.createRequire(path.join(root, 'frontend/package.json'));
const filename = path.join(root, 'frontend/src/lib/seo-image-upload.ts');
const code = frontend('next/dist/build/swc').transformSync(fs.readFileSync(filename,'utf8'), {
  filename,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'},
}).code;
const loaded = new Module(filename,module); loaded._compile(code,filename);
const { getSeoImageUploadConfig, uploadSeoImage } = loaded.exports;
const config = {enabled:true,maxBytes:1000,acceptedTypes:['image/jpeg','image/png']};
const blob = new Blob([new Uint8Array([255,216,255,224,1,2,3])],{type:'image/jpeg'});
const file = new File([blob],'fixture.jpg',{type:'image/jpeg'});
const id = '12345678-1234-1234-1234-123456789abc';
const safeUrl = 'https://fixture-cdn.invalid/seo-shares/image.jpg';
const secret = 'PRIVATE-UPSTREAM-DETAIL-MUST-NOT-RENDER';
let checks=0,calls=[],revoked=0,draw=[],canvas,qualities=[],attempt=0,mode='',signedChanges={},configChanges={},dimensions=[2000,1000];
const check = (actual,label) => {assert.ok(actual,label);checks++;};
const signal = () => new AbortController().signal;
URL.createObjectURL = () => 'blob:seo-fixture'; URL.revokeObjectURL = () => revoked++;
global.Image = class { get width(){return dimensions[0];} get height(){return dimensions[1];} async decode(){ if(mode==='decode')throw Error(secret); } };
global.document = {createElement:()=>{
  canvas={getContext:()=>mode==='canvas'?null:{fillStyle:'',fillRect(...args){check(args.join(',')==='0,0,1200,630','fills letterbox frame');},drawImage(...args){draw=args.slice(1);}},
    toBlob(callback,type,quality){qualities.push(quality);attempt++;callback(mode==='oversize'||mode==='quality'&&attempt===1?new Blob([new Uint8Array(1001)],{type:'image/jpeg'}):blob);}};
  return canvas;
}};
global.fetch = async (url,options) => {
  options.signal.throwIfAborted();calls.push({url,options});
  if(url.startsWith('/')){
    check(url.startsWith('/api/admin/seo-media/'),'only administrator BFF paths');
    check(options.credentials==='same-origin'&&options.cache==='no-store'&&options.redirect==='error','app request private routing');
  }
  if(url.endsWith('/config'))return Response.json({...config,...configChanges});
  if(url.endsWith('/presign')){
    if(mode==='network')throw Error(secret);
    if(mode==='denied')return Response.json({message:secret},{status:403});
    const body=JSON.parse(options.body);
    check(Object.keys(body).sort().join(',')==='contentType,sha256,size','presign metadata is bounded');
    check(body.size===blob.size&&body.contentType===blob.type,'presign uses converted image');
    const expected=require('node:crypto').createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('base64');
    check(body.sha256===expected,'checksum covers final converted bytes');
    const headers={'Content-Type':blob.type,'x-amz-checksum-sha256':mode==='checksum'?'wrong':body.sha256};
    if(mode==='headers')headers.Authorization=secret;
    if(mode==='header-newline')headers['x-amz-test']='bad\r\n'+secret;
    return Response.json({uploadId:id,uploadUrl:'https://fixture-storage.invalid/upload?signature=fixture',method:'PUT',expiresAt:Date.now()+60000,headers,...signedChanges});
  }
  if(url.endsWith('/complete')){
    check(JSON.parse(options.body).uploadId===id,'complete uses issued ID');
    return Response.json({url:mode==='complete'?'javascript:bad':safeUrl,photo:'not-used',token:secret});
  }
  check(url.startsWith('https://fixture-storage.invalid/'),'storage URL is fake');
  check(options.credentials==='omit'&&options.referrerPolicy==='no-referrer'&&options.redirect==='error','storage gets no app cookies/referrer and cannot redirect');
  check(options.method==='PUT'&&options.body===blob,'storage gets exact final image');
  if(mode==='put-network')throw Error(secret);
  return new Response(null,{status:mode==='put'?403:200});
};
function reset(){calls=[];draw=[];qualities=[];attempt=0;mode='';signedChanges={};configChanges={};dimensions=[2000,1000];}
async function rejects(action,label){await assert.rejects(action,error=>error instanceof Error&&!error.message.includes(secret)&&!error.message.includes('signature='));checks++;}
(async()=>{
  assert.deepEqual(await getSeoImageUploadConfig(signal()),config);checks++;
  for(const changes of [{enabled:'true'},{maxBytes:0},{maxBytes:1.5},{maxBytes:5242881},{acceptedTypes:['image/svg+xml']}]){
    configChanges=changes;await rejects(getSeoImageUploadConfig(signal()),'malformed config');
  }
  reset();const stages=[];
  assert.deepEqual(await uploadSeoImage(file,config,signal(),stage=>stages.push(stage)),{url:safeUrl});checks++;
  check(stages.join(',')==='prepare,upload,verify','complete stage sequence');check(canvas.width===1200&&canvas.height===630,'fixed social frame');
  assert.deepEqual(draw,[0,15,1200,600]);checks++;
  check(revoked===1&&calls.length===3,'object URL cleanup and exactly three network steps');
  for(const dims of [[1000,2000],[1200,630]]){
    reset();dimensions=dims;await uploadSeoImage(file,config,signal(),()=>{});
    check(Math.abs(draw[2]/draw[3]-dims[0]/dims[1])<.0001,'portrait and landscape aspect ratio preserved');
    check(draw[0]>=0&&draw[1]>=0&&draw[0]+draw[2]<=1200&&draw[1]+draw[3]<=630,'image contained in letterbox');
  }
  reset();mode='quality';await uploadSeoImage(file,config,signal(),()=>{});assert.deepEqual(qualities,[.9,.82]);checks++;
  for(const failure of ['oversize','decode','canvas','network','denied','checksum','headers','header-newline','put','put-network','complete']){
    reset();mode=failure;await rejects(uploadSeoImage(file,config,signal(),()=>{}),failure);
    if(['oversize','decode','canvas'].includes(failure))check(calls.length===0,'preparation failure never signs');
    if(['checksum','headers','header-newline','network','denied'].includes(failure))check(calls.length===1,'bad signing response never uploads');
    if(['put','put-network'].includes(failure))check(calls.length===2,'failed upload is never completed');
  }
  for(const changes of [{method:'POST'},{uploadId:'invalid'},{expiresAt:0},{expiresAt:Infinity},{uploadUrl:'http://storage.invalid/a'},
    {uploadUrl:'https://user:pass@storage.invalid/a'},{uploadUrl:'data:image/png;base64,AA=='},{uploadUrl:'https://storage.invalid/a#fragment'},{headers:[]}]){
    reset();signedChanges=changes;await rejects(uploadSeoImage(file,config,signal(),()=>{}),'bad signing metadata');check(calls.length===1,'unsafe upload never sent');
  }
  for(const badFile of [new File([],'empty.jpg',{type:'image/jpeg'}),new File([blob],'bad.svg',{type:'image/svg+xml'}),new File([new Uint8Array(10*1024*1024+1)],'large.jpg',{type:'image/jpeg'})]){
    reset();await rejects(uploadSeoImage(badFile,config,signal(),()=>{}),'bad source image');check(calls.length===0,'bad file never signs');
  }
  reset();await rejects(uploadSeoImage(file,{...config,enabled:false},signal(),()=>{}),'disabled fallback');check(calls.length===0,'disabled upload has no requests');
  for(const stage of ['prepare','upload','verify']){
    reset();const controller=new AbortController();await assert.rejects(uploadSeoImage(file,config,controller.signal,current=>{if(current===stage)controller.abort();}),{name:'AbortError'});checks++;
    check(calls.length===({prepare:0,upload:1,verify:2})[stage],'cancel prevents next network step');
  }
  reset();const aborted=new AbortController();aborted.abort();await assert.rejects(uploadSeoImage(file,config,aborted.signal,()=>{}),{name:'AbortError'});checks++;
  check(calls.length===0,'already cancelled never starts');
  console.log(`PASS SEO image upload: ${checks} checks; letterbox, quality bound, checksum, privacy, admin routing, cancellation. No cloud requests.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});

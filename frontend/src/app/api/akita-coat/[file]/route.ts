import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {akitaCoatAssets} from '@/lib/akita-coat';
import artRevision from '@/lib/generated/akita-art-revision.json';
import release from '@/lib/generated/akita-art-release.json';
export const runtime='nodejs';
// Exact immutable catalog only: same-origin pixel reads avoid requiring CDN CORS.
export async function GET(_request:Request,context:{params:Promise<{file:string}>}){
  const {file}=await context.params;
  const hashes=new Set(Object.values(akitaCoatAssets.sheets).flatMap(s=>[s.bodySha256,s.maskSha256]));
  hashes.add(akitaCoatAssets.glasses.sha256);
  for(const action of Object.values(artRevision.actions))for(const hash of [action.bodySha256,action.maskSha256,action.closedSha256,action.desktopBodySha256,action.desktopMaskSha256,action.previewSha256,action.compatibilitySha256])hashes.add(hash);
  const master=file===`${artRevision.sourceSha256}.aseprite`;
  const hash=file.replace(/\.(?:png|aseprite)$/,'');
  if(!master&&(file!==`${hash}.png`||!hashes.has(hash)))return new Response(null,{status:404});
  try{
    let bytes:Uint8Array;
    if(release.baseUrl){
      const origin=new URL(release.baseUrl);
      if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash)throw new Error('Invalid asset release');
      const response=await fetch(`${release.baseUrl}/${file}`,{cache:'force-cache',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)return new Response(null,{status:502});
      if(Number(response.headers.get('content-length'))>12*1024*1024)return new Response(null,{status:502});
      bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length>12*1024*1024)return new Response(null,{status:502});
    }else{
      if(process.env.NODE_ENV==='production')return new Response(null,{status:404});
      bytes=await readFile(path.resolve(process.cwd(),'../local-assets/site/akita-coat',file));
    }
    if(createHash('sha256').update(bytes).digest('hex')!==hash)return new Response(null,{status:409});
    return new Response(bytes as BodyInit,{headers:{'Content-Type':master?'application/octet-stream':'image/png','Cache-Control':'public, max-age=31536000, s-maxage=31536000, immutable','ETag':`"${hash}"`,'X-Content-Type-Options':'nosniff',...(master?{'Content-Disposition':'attachment; filename="akita-clean-body-r2.aseprite"'}:{})}});
  }catch{return new Response(null,{status:404});}
}

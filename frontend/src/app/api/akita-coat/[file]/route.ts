import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {akitaCoatAssets} from '@/lib/akita-coat';
import artRevision from '@/lib/generated/akita-art-revision.json';
export const runtime='nodejs';
// Local pilot media only. Production uses an explicitly published CDN base.
export async function GET(_request:Request,context:{params:Promise<{file:string}>}){
  if(process.env.NODE_ENV==='production')return new Response(null,{status:404});
  const {file}=await context.params;
  const hashes=new Set(Object.values(akitaCoatAssets.sheets).flatMap(s=>[s.bodySha256,s.maskSha256]));
  hashes.add(akitaCoatAssets.glasses.sha256);
  for(const action of Object.values(artRevision.actions))for(const hash of [action.bodySha256,action.maskSha256,action.closedSha256])hashes.add(hash);
  const hash=file.replace(/\.png$/,'');
  if(file!==`${hash}.png`||!hashes.has(hash))return new Response(null,{status:404});
  try{
    const bytes=await readFile(path.resolve(process.cwd(),'../local-assets/site/akita-coat',file));
    if(createHash('sha256').update(bytes).digest('hex')!==hash)return new Response(null,{status:409});
    return new Response(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=31536000, immutable','ETag':`"${hash}"`,'X-Content-Type-Options':'nosniff'}});
  }catch{return new Response(null,{status:404});}
}

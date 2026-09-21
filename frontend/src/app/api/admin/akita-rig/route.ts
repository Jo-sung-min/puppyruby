import {readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {apiBase,apiFailure,browserIdentity,isSameOrigin,privateHeaders,readJsonBody} from '@/lib/server-session';
import {parseAkitaRig} from '@/lib/akita-coat';
export const runtime='nodejs';
export async function PUT(request:NextRequest){
 if(process.env.NODE_ENV==='production')return apiFailure('시범 위치 편집은 로컬 개발 서버에서 저장해 주세요.',409);
 if(!isSameOrigin(request,true))return apiFailure('요청 출처를 확인해 주세요.',403);
 const identity=await browserIdentity();if(!identity.hasSession)return apiFailure('관리자로 로그인해 주세요.',401);
 try{
  const check=await fetch(`${apiBase()}/admin/overview`,{headers:identity.headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!check.ok)return apiFailure('관리자 권한을 확인해 주세요.',check.status===401?401:403);
  const rig=parseAkitaRig(await readJsonBody(request,90000));
  const target=path.resolve(process.cwd(),'../shared/akita-accessory-rig.json');
  let lock;
  try { lock=await open(target+'.lock','wx'); } catch { return apiFailure('다른 저장을 처리 중이에요. 잠시 후 다시 저장해 주세요.',409); }
  try {
  const previous=JSON.parse(await readFile(target,'utf8'));
  if(previous.revision!==rig.revision)return apiFailure('다른 창에서 위치가 바뀌었어요. 새로고침해 주세요.',409);
  rig.revision='akita-rig-'+createHash('sha256').update(JSON.stringify(rig.actions)).digest('hex').slice(0,16);
  const body=JSON.stringify(rig,null,2)+'\n';
  await writeFile(target+'.tmp',body);await rename(target+'.tmp',target);
  const generated=path.resolve(process.cwd(),'src/lib/generated/akita-accessory-rig.json');
  await writeFile(generated+'.tmp',body);await rename(generated+'.tmp',generated);
  return NextResponse.json(rig,{headers:privateHeaders});
  } finally { await lock.close(); await unlink(target+'.lock'); }
 }catch{return apiFailure('위치 정보나 개발 서버 연결을 확인해 주세요.',400);}
}

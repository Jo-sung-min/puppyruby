import source from './generated/akita-coat-assets.json';
import palettes from './generated/coat-palettes.json';
import rigSource from './generated/akita-accessory-rig.json';
import fingerprints from './generated/desktop-appearance-assets.json';
import art from './generated/akita-art-revision.json';
import release from './generated/akita-art-release.json';

export type CoatPalette = { id: string; label: string; color: string; primary: string[]; secondary: string[] };
export type AkitaSlot = 'face' | 'head' | 'neck' | 'back';
export type AkitaPlacement = { x:number; y:number; width:number; height:number; rotation:number; flipX:boolean; visible:boolean; view:'front'|'left'|'right'|'back'|'supine' };
export type AkitaRig = {schemaVersion:number;revision:string;sourceSha256:string;actions:Record<string,Record<AkitaSlot,AkitaPlacement>[]>};
export const coatPalettes: CoatPalette[] = palettes.items;
export const coatRevision = palettes.revision;
export const akitaCoatAssets = {...source,sourceSha256:art.sourceSha256,sheets:Object.fromEntries(Object.entries(source.sheets).map(([id,sheet])=>{
  const revised=art.actions[id as keyof typeof art.actions];
  return [id,{...sheet,bodySha256:revised.bodySha256,maskSha256:revised.maskSha256,bodyPng:`/akita-coat/${revised.bodySha256}.png`}];
}))};
export const akitaRig = rigSource as AkitaRig;
export const akitaSlots: AkitaSlot[] = ['face','head','neck','back'];

export function akitaCoatEnabled() { return process.env.NODE_ENV !== 'production' || !!process.env.NEXT_PUBLIC_AKITA_COAT_BASE_URL || !!release.baseUrl; }
export function coatAssetUrl(hash:string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid coat asset hash');
  const base=(process.env.NEXT_PUBLIC_AKITA_COAT_BASE_URL || release.baseUrl)?.replace(/\/+$/, '');
  if(base){const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Invalid coat CDN base');}
  return base ? `${base}/${hash}.png` : `/api/akita-coat/${hash}.png`;
}
export function coatPalette(id:unknown) { return coatPalettes.find(p=>p.id===id) ?? coatPalettes[0]; }
export function akitaCoatSheet(breed:string,action:string,png:string) {
  if(breed!=='akita'||!akitaCoatEnabled())return undefined;
  const sheet=(source.sheets as Record<string,{bodySha256:string;bodyPng:string;maskSha256:string;maskPng:string;frames:number}>)[action];
  const current=(fingerprints as Record<string,{sha256:string}>)[png];
  if(sheet?.bodyPng!==png || current?.sha256!==sheet.bodySha256)return undefined;
  const revised=art.actions[action as keyof typeof art.actions];
  return revised ? {...sheet,bodySha256:revised.bodySha256,maskSha256:revised.maskSha256} : sheet;
}

/** Shared integer sRGB interpolation. Keep identical to DesktopCoat.Apply. */
export function coatColor(tone:number, colors:string[]) {
  const second=tone>=128, from=colors[second?1:0],to=colors[second?2:1];
  const amount=second?tone-128:tone, divisor=second?127:128;
  return [1,3,5].map(i=>Math.floor((parseInt(from.slice(i,i+2),16)*(divisor-amount)+parseInt(to.slice(i,i+2),16)*amount+Math.floor(divisor/2))/divisor));
}
export function applyCoatPixels(body:Uint8ClampedArray,mask:Uint8ClampedArray,palette:CoatPalette) {
  if(body.length!==mask.length||body.length%4)throw new Error('Coat mask dimensions differ');
  const output=new Uint8ClampedArray(body);
  if(palette.id==='original')return output;
  const table=[palette.primary,palette.secondary].map(colors=>Array.from({length:256},(_,tone)=>coatColor(tone,colors)));
  for(let i=0;i<body.length;i+=4){
    const role=mask[i]; if(!body[i+3]||role===0)continue;
    if((role!==1&&role!==2)||mask[i+3]!==255)throw new Error('Unknown coat material');
    const rgb=table[role-1][mask[i+1]];
    output[i]=rgb[0];output[i+1]=rgb[1];output[i+2]=rgb[2];
  }
  return output;
}

export function parseAkitaRig(value:unknown):AkitaRig {
  const v=value as AkitaRig;
  if(!v||v.schemaVersion!==1||v.sourceSha256!==art.sourceSha256||typeof v.revision!=='string'||!/^[-a-zA-Z0-9._]{1,80}$/.test(v.revision)
    ||!v.actions||Object.keys(v.actions).sort().join()!==Object.keys(source.sheets).sort().join())throw new Error('아키타 원본과 16동작을 확인해 주세요.');
  for(const frames of Object.values(v.actions)){
    if(!Array.isArray(frames)||frames.length!==4)throw new Error('동작마다 4프레임이 필요해요.');
    for(const frame of frames)for(const slot of akitaSlots){
      const p=frame?.[slot];
      if(!p||![p.x,p.y,p.width,p.height,p.rotation].every(Number.isFinite)||p.x<0||p.x>source.width||p.y<0||p.y>source.height
       ||p.width<1||p.width>source.width||p.height<1||p.height>source.height||Math.abs(p.rotation)>180
       ||typeof p.visible!=='boolean'||typeof p.flipX!=='boolean'||!['front','left','right','back','supine'].includes(p.view))throw new Error('위치와 크기를 확인해 주세요.');
    }
  }
  // Drop unrecognized fields before a draft is written to disk.
  return {schemaVersion:1,revision:v.revision,sourceSha256:v.sourceSha256,actions:Object.fromEntries(Object.entries(v.actions).map(([id,frames])=>[id,frames.map(f=>Object.fromEntries(akitaSlots.map(slot=>{const p=f[slot];return [slot,{x:p.x,y:p.y,width:p.width,height:p.height,rotation:p.rotation,flipX:p.flipX,visible:p.visible,view:p.view}];})) as Record<AkitaSlot,AkitaPlacement>)]))};
}

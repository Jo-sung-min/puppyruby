'use client';
import {useEffect,useState} from 'react';
import {applyCoatPixels,coatAssetUrl,coatPalette,coatRevision} from '../lib/akita-coat';

const pending=new Map<string,Promise<string>>();
async function pixels(hash:string,width:number,height:number,localOnly=false) {
  const response=await fetch(localOnly?`/api/akita-coat/${hash}.png`:coatAssetUrl(hash),{credentials:'omit'});
  if(!response.ok)throw new Error('coat image unavailable');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>12*1024*1024)throw new Error('coat image too large');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  if(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==hash)throw new Error('coat image hash mismatch');
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
  try{
    if(bitmap.width!==width||bitmap.height!==height)throw new Error('coat image size mismatch');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('canvas unavailable');
    ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,width,height);
  }finally{bitmap.close();}
}
function dyed(body:string,mask:string,paletteId:string,width:number,height:number,localOnly=false){
  const key=[body,mask,paletteId,coatRevision,localOnly].join(':');
  if(!pending.has(key)){
    // Bounded cache: at most the 16 actions × four pilot colors plus a small margin.
    if(pending.size>=72)pending.delete(pending.keys().next().value!);
    const job=Promise.all([pixels(body,width,height,localOnly),pixels(mask,width,height,localOnly)]).then(([b,m])=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas unavailable');
      b.data.set(applyCoatPixels(b.data,m.data,coatPalette(paletteId)));ctx.putImageData(b,0,0);
      return canvas.toDataURL('image/png');
    }).catch(error=>{pending.delete(key);throw error;});pending.set(key,job);
  }
  return pending.get(key)!;
}
export function RubyCoatBody({bodyHash,maskHash,paletteId,href,width,height,x,className,localOnly=false}:{bodyHash:string;maskHash:string;paletteId:string;href:string;width:number;height:number;x:number;className?:string;localOnly?:boolean}){
  const key=[bodyHash,maskHash,paletteId,coatRevision,localOnly].join(':');
  const [result,setResult]=useState<{key:string;url?:string;failed?:boolean}>();
  useEffect(()=>{let active=true;dyed(bodyHash,maskHash,paletteId,width,height,localOnly).then(url=>{if(active)setResult({key,url});},()=>{if(active)setResult({key,failed:true});});return()=>{active=false;};},[bodyHash,maskHash,paletteId,width,height,key,localOnly]);
  const current=result?.key===key?result:undefined;
  return <image href={current?.url??href} x={x} width={width} height={height} preserveAspectRatio="none" className={className}
    data-eyeless-body="true" data-coat-status={current?.failed?'failed':current?.url?'ready':'loading'} data-coat-palette={paletteId}/>;
}

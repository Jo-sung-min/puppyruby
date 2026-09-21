'use client';
import {useEffect,useState} from 'react';
import art from '@/lib/generated/akita-art-revision.json';
import {coatPalettes} from '@/lib/akita-coat';
import {rubyEyeStyles,rubyEyeStyle} from '@/lib/ruby-round-eyes';
import {rubyRoundActions} from '@/lib/ruby-round-scene-styles';
import {assetUrl} from '@/lib/asset-url';
import {RubyCoatBody} from '../ruby-coat-body';
import styles from './akita-coat-lab.module.css';

type Action=keyof typeof art.actions;
export function AkitaArtRevision(){
 const [open,setOpen]=useState(false),[action,setAction]=useState<Action>('idle'),[frame,setFrame]=useState(0);
 const [playing,setPlaying]=useState(true),[coat,setCoat]=useState('silver'),[eye,setEye]=useState('ruby-eye-01'),[showEyes,setShowEyes]=useState(true);
 const [background,setBackground]=useState('dark');
 const sheet=art.actions[action],palette=coatPalettes.find(p=>p.id===coat)!,eyeAsset=rubyEyeStyle(eye);
 useEffect(()=>{if(!open||!playing)return;const timer=setInterval(()=>setFrame(f=>(f+1)%4),sheet.frameMs);return()=>clearInterval(timer);},[open,playing,sheet.frameMs,action]);
 const url=(hash:string)=>`/api/akita-coat/${hash}.png`;
 // This revision remains a local review asset until its art and attachment positions are approved.
 if(process.env.NODE_ENV==='production')return null;
 return <details className={styles.lab} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>아키타 적용본 · 깨끗한 얼굴과 네 발</summary>
  {open&&<>
   <p>선택하신 수정본이 아키타에 적용됐어요. 눈 자국 없는 몸통에 눈을 따로 얹고, 옆모습과 반가워요를 네 발로 정리했어요.</p>
   <div className={styles.colors}>{coatPalettes.map(p=><button key={p.id} type="button" aria-pressed={coat===p.id} onClick={()=>setCoat(p.id)}><span className={styles.swatch} style={{background:p.color}}/>{p.label}</button>)}</div>
   <div className={styles.grid}>
    <div className={styles.stage} style={{background:background==='light'?'#f5eee2':background==='checker'?'repeating-conic-gradient(#292b33 0% 25%, #42454f 0% 50%) 0 / 20px 20px':'#191b20'}}>
     <svg viewBox="0 0 179 188" role="img" aria-label={`아키타 수정본 · ${sheet.name} · ${palette.label}`} style={{imageRendering:'pixelated'}} data-akita-art-revision={art.revision} data-review-frame={frame}>
      <RubyCoatBody bodyHash={sheet.bodySha256} maskHash={sheet.maskSha256} paletteId={coat} href={url(sheet.bodySha256)} x={-frame*179} width={716} height={188} localOnly/>
      {showEyes&&<g data-revision-eyes="true">{sheet.eyeModes[frame]==='closed'
       ? <image href={url(sheet.closedSha256)} x={-frame*179} width={716} height={188}/>
       : sheet.eyes[frame].map((a,i)=><svg key={i} x={a.x} y={a.y} width={a.width} height={a.height} viewBox={`${i*16} 0 16 16`} overflow="hidden"><image href={assetUrl(eyeAsset.png)} width="32" height="16"/></svg>)}</g>}
     </svg>
    </div>
    <div className={styles.controls}>
     <label>수정본 동작<select value={action} onChange={e=>{setAction(e.target.value as Action);setFrame(0);}}>{rubyRoundActions.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
     <label>수정본 눈<select value={eye} onChange={e=>setEye(e.target.value)}>{rubyEyeStyles.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
     <label>눈 레이어 표시<input type="checkbox" checked={showEyes} onChange={e=>setShowEyes(e.target.checked)}/></label>
     <label>수정본 재생<input type="checkbox" checked={playing} onChange={e=>setPlaying(e.target.checked)}/></label>
     <label>수정본 프레임 {frame+1} / 4<input type="range" min="0" max="3" value={frame} disabled={playing} onChange={e=>setFrame(Number(e.target.value))}/></label>
     <label>검수 배경<select value={background} onChange={e=>setBackground(e.target.value)}><option value="dark">어두운 배경</option><option value="light">밝은 배경</option><option value="checker">체크무늬</option></select></label>
     <p>눈 표시를 끄면 몸통에 눈·눈자국이 남아 있지 않은지 확인할 수 있어요. 잠자는 표정도 몸통과 분리했습니다.</p>
    </div>
   </div>
  </>}
 </details>;
}

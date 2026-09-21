'use client';
import {useState} from 'react';
import {akitaRig,akitaSlots,coatPalettes,akitaCoatEnabled,parseAkitaRig,type AkitaPlacement,type AkitaSlot} from '@/lib/akita-coat';
import {rubyRoundActions,type RubyRoundActionId} from '@/lib/ruby-round-scene-styles';
import {rubyEyeStyles} from '@/lib/ruby-round-eyes';
import {RubyRoundPixelDog} from '../ruby-round-pixel-dog';
import styles from './akita-coat-lab.module.css';
const slotItems:Record<AkitaSlot,string>={face:'glasses',head:'crown',neck:'scarf',back:'angel-wings'};
export function AkitaCoatLab(){
 const [open,setOpen]=useState(false),[rig,setRig]=useState(akitaRig),[action,setAction]=useState<RubyRoundActionId>('idle');
 const [frame,setFrame]=useState(0),[playing,setPlaying]=useState(false),[slot,setSlot]=useState<AkitaSlot>('face');
 const [coat,setCoat]=useState('original'),[eye,setEye]=useState('ruby-eye-01'),[accessory,setAccessory]=useState(true);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const placement=rig.actions[action][frame][slot];
 const edit=(values:Partial<AkitaPlacement>)=>setRig(old=>({...old,actions:{...old.actions,[action]:old.actions[action].map((f,i)=>i===frame?{...f,[slot]:{...f[slot],...values}}:f)}}));
 async function save(){
  setBusy(true);setMessage('');
  try{const valid=parseAkitaRig(rig);const r=await fetch('/api/admin/akita-rig',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});const data=await r.json();if(!r.ok)throw new Error(data.message);setRig(parseAkitaRig(data));setMessage('아키타 위치를 저장했어요. 새로고침하면 웹과 연결 응답에도 적용돼요.');}
  catch(e){setMessage(e instanceof Error?e.message:'저장하지 못했어요.');}finally{setBusy(false);}
 }
 function download(){try{const valid=parseAkitaRig(rig),url=URL.createObjectURL(new Blob([JSON.stringify(valid,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='akita-accessory-rig.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setMessage(e instanceof Error?e.message:'위치값을 확인해 주세요.');}}
 return <details className={styles.lab} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>아키타 · 염색과 액세서리 작업실</summary>
  {open&&<>
   <p>아키타 한 종의 16동작을 확인해요. 눈과 액세서리는 몸통 위에 따로 올라가고, 염색은 털 영역에만 적용돼요.</p>
   {!akitaCoatEnabled()&&<p role="status">아키타 시범 자산이 아직 이 배포에 공개되지 않았어요. 로컬 작업실에서 확인해 주세요.</p>}
   <div className={styles.colors}>{coatPalettes.map(p=><button key={p.id} type="button" aria-pressed={coat===p.id} onClick={()=>setCoat(p.id)}><span className={styles.swatch} style={{background:p.color}}/>{p.label}</button>)}</div>
   <div className={styles.grid}>
    <div className={styles.stage}>
     <RubyRoundPixelDog breed="akita" mood="idle" scene={action} frame={frame} paused={!playing} coatId={coat} eyeStyle={eye} groundShadow={false} accessory={accessory?slotItems[slot]:'none'} accessoryPlacements={rig.actions[action].map(f=>f[slot])}/>
     {!playing&&accessory&&<svg className={styles.drag} viewBox="0 0 179 188" aria-label="액세서리 위치 드래그" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const r=e.currentTarget.getBoundingClientRect();edit({x:Math.round(Math.max(0,Math.min(179,(e.clientX-r.left)/r.width*179))),y:Math.round(Math.max(0,Math.min(188,(e.clientY-r.top)/r.height*188)))});}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}>
      <circle cx={placement.x} cy={placement.y} r="3" fill="#78e7da"/><rect x={placement.x-placement.width/2} y={placement.y-placement.height/2} width={placement.width} height={placement.height} fill="none" stroke="#78e7da" strokeWidth=".7" strokeDasharray="3 3"/>
     </svg>}
    </div>
    <div className={styles.controls}>
     <label>동작<select value={action} onChange={e=>setAction(e.target.value as RubyRoundActionId)}>{rubyRoundActions.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
     <label>눈<select value={eye} onChange={e=>setEye(e.target.value)}>{rubyEyeStyles.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
     <label>부착 위치<select value={slot} onChange={e=>setSlot(e.target.value as AkitaSlot)}>{akitaSlots.map(s=><option key={s} value={s}>{{face:'얼굴 · 안경',head:'머리 · 왕관',neck:'목 · 목도리',back:'등 · 날개'}[s]}</option>)}</select></label>
     <label>액세서리 표시<input type="checkbox" checked={accessory} onChange={e=>setAccessory(e.target.checked)}/></label>
     <label>애니메이션 재생<input type="checkbox" checked={playing} onChange={e=>setPlaying(e.target.checked)}/></label>
     <label>프레임 {frame+1} / 4<input type="range" min="0" max="3" value={frame} disabled={playing} onChange={e=>setFrame(Number(e.target.value))}/></label>
     {(['x','y','width','height','rotation'] as const).map(key=><label key={key}>{{x:'가로 위치',y:'세로 위치',width:'너비',height:'높이',rotation:'회전'}[key]}<input type="number" value={placement[key]} min={key==='rotation'?-180:key==='width'||key==='height'?1:0} max={key==='rotation'?180:key==='x'||key==='width'?179:188} disabled={playing} onChange={e=>edit({[key]:Number(e.target.value)})}/></label>)}
     <label>이 프레임에서 표시<input type="checkbox" checked={placement.visible} disabled={playing} onChange={e=>edit({visible:e.target.checked})}/></label>
     <label>좌우 반전<input type="checkbox" checked={placement.flipX} disabled={playing} onChange={e=>edit({flipX:e.target.checked})}/></label>
     <label>자세 분류<select value={placement.view} disabled={playing} onChange={e=>edit({view:e.target.value as AkitaPlacement['view']})}>{Object.entries({front:'정면',left:'왼쪽',right:'오른쪽',back:'뒷모습',supine:'배 보이며 눕기'}).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
    </div>
   </div>
   <div className={styles.actions}><button type="button" className="account-button" disabled={busy} onClick={save}>아키타 위치 저장</button><button type="button" className="account-button account-button-soft" onClick={download}>위치 파일 내보내기</button><button type="button" className="account-button account-button-soft" onClick={()=>{setRig(akitaRig);setMessage('마지막 불러온 위치로 되돌렸어요.');}}>되돌리기</button></div>
   <p role="status">{message||'이미지를 다시 만들지 않고 위치만 수정해요. 시범 단계의 위치 저장은 로컬 개발 서버에서 지원해요.'}</p>
   <p>자세 분류는 이후 방향별 액세서리 제작에 쓰는 기록이에요. 현재 그림의 방향은 회전과 좌우 반전으로 조정해요.</p>
  </>}
 </details>;
}

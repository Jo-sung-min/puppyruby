import { cuteDogArchive, cuteDogBodies, cuteDogFamilies, cuteDogStyles, type CuteDogBody, type CuteDogFamily, type CuteDogStyleId } from "@/lib/cute-dog-styles";
import { PixelDog } from "../pixel-dog";
import { isPremiumDogStyleId } from "@/lib/premium-dog-styles";
import { isOriginalArtDogStyleId } from "@/lib/original-art-dog-styles";

export type CuteStyleFilter = { group: "premium" | "original-art" | "cute" | "all" | "previous"; family: CuteDogFamily | "all"; body: CuteDogBody | "all" };
export const initialCuteStyleFilter: CuteStyleFilter = { group: "premium", family: "all", body: "all" };

export function filterDogStyleChoices<T extends {id:string}>(choices: T[], filter: CuteStyleFilter): T[] {
  return choices.filter(choice => {
    const cute = cuteDogStyles.find(style=>style.id===choice.id);
    const premium = isPremiumDogStyleId(choice.id);
    const originalArt = isOriginalArtDogStyleId(choice.id);
    if(filter.group==="premium")return premium;
    if(filter.group==="original-art")return originalArt;
    if(filter.group==="previous")return !cute && !premium && !originalArt;
    if(filter.group==="all")return true;
    return cute && (filter.family==="all" || cute.family===filter.family) && (filter.body==="all" || cute.body===filter.body);
  });
}

export function AdminCuteStyleFeatured({available,busy,onBrowse}:{available:string[];busy:boolean;onBrowse:(family?:CuteDogFamily)=>void}) {
  const remaining = cuteDogStyles.filter(style=>available.includes(style.id));
  if(!remaining.length)return null;
  return <section className="account-card admin-cute-featured" aria-label="새로운 귀여운 도트 스타일">
    <div className="admin-cute-featured-heading">
      <div><span className="admin-dog-eyebrow">C12 · C01 · C06 · C04에서 이어진 강아지</span><h3>귀여운 체형 16가지</h3><p>통통한 배, 날씬한 몸, 긴 다리, 짧은 다리.<br/>마음에 든 얼굴을 골라 견종과 털무늬를 바꿔 보세요.</p></div>
      <a className="account-button account-button-soft" href={cuteDogArchive} download>원본 PNG · Aseprite 16종</a>
    </div>
    <div className="admin-cute-family-grid">{cuteDogFamilies.map(family=>{
      const first=remaining.find(style=>style.family===family.id);
      if(!first)return null;
      return <button type="button" key={family.id} disabled={busy} onClick={()=>onBrowse(family.id)} aria-label={`${family.source} ${family.name} 체형 보기`}>
        <span><PixelDog breed="pomeranian" styleId={first.id as CuteDogStyleId} groundShadow={false} decorative/></span>
        <strong>{family.name}</strong><small>{family.source} · 체형 {remaining.filter(style=>style.family===family.id).length}종</small>
      </button>;
    })}</div>
    <button type="button" className="account-button account-button-soft" disabled={busy} onClick={()=>onBrowse()}>새 스타일 모두 비교하기</button>
  </section>;
}

export function AdminCuteStyleFilters({value,onChange,busy,allCount,cuteCount,premiumCount,originalArtCount=0,id}:{value:CuteStyleFilter;onChange:(filter:CuteStyleFilter)=>void;busy:boolean;allCount:number;cuteCount:number;premiumCount:number;originalArtCount?:number;id:string}) {
  return <div className="admin-cute-controls">
    <div className="admin-cute-filter-tabs" role="group" aria-label="도트 스타일 모음">
      {([{id:"premium",name:`고급 도트 ${premiumCount}종`},{id:"original-art",name:`이전 시안 ${originalArtCount}개`},{id:"cute",name:`귀여운 체형 ${cuteCount}개`},{id:"all",name:`전체 ${allCount}개`},{id:"previous",name:`이전 스타일 ${allCount-cuteCount-premiumCount-originalArtCount}개`}] as const).map(group=><button type="button" key={group.id} disabled={busy} aria-pressed={value.group===group.id} onClick={()=>onChange({group:group.id,family:"all",body:"all"})}>{group.name}</button>)}
    </div>
    {value.group==="cute"&&<div className="admin-cute-filter-fields">
      <label className="account-field" htmlFor={`${id}-cute-family`}><span>얼굴 타입</span><select id={`${id}-cute-family`} disabled={busy} value={value.family} onChange={event=>onChange({...value,family:event.target.value as CuteStyleFilter["family"]})}><option value="all">모든 얼굴</option>{cuteDogFamilies.map(family=><option key={family.id} value={family.id}>{family.source} · {family.name}</option>)}</select></label>
      <label className="account-field" htmlFor={`${id}-cute-body`}><span>체형</span><select id={`${id}-cute-body`} disabled={busy} value={value.body} onChange={event=>onChange({...value,body:event.target.value as CuteStyleFilter["body"]})}><option value="all">모든 체형</option>{cuteDogBodies.map(body=><option key={body.id} value={body.id}>{body.name}</option>)}</select></label>
    </div>}
  </div>;
}

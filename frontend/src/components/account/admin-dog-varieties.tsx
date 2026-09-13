"use client";

import { useId, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { defaultVariantLook, styleBreeds, type AppearanceConfig, type DogStyleId, type DogVariety } from "@/lib/dog-styles";
import { addCoatPreset, findCoatPresetVariety, shibaCoatPresets, type DogCoatPreset } from "@/lib/dog-coat-presets";
import { PixelDog, type PixelBreed } from "../pixel-dog";
import { isPremiumDogStyleId } from "@/lib/premium-dog-styles";
import { isOriginalArtDogStyleId } from "@/lib/original-art-dog-styles";
import { isNativeSceneStyle } from "@/lib/native-dog-scenes";

const shapes: { id: DogVariety["shape"]; name: string }[] = [
  { id: "original", name: "기본형" }, { id: "teddy", name: "곰돌이형 · 둥근 귀와 볼" }, { id: "fox", name: "여우형 · 뾰족한 귀와 얼굴" },
];
const patterns: { id: DogVariety["pattern"]; name: string }[] = [
  { id: "solid", name: "단색" }, { id: "tuxedo", name: "턱시도" }, { id: "patches", name: "얼룩" },
  { id: "freckles", name: "주근깨" }, { id: "socks", name: "양말" }, { id: "blaze", name: "이마 줄무늬" },
];

export function AdminDogVarieties({ config, breed, selected, busy, edit, select, inherit, previewStyle }: {
  config: AppearanceConfig; breed: PixelBreed; selected?: DogVariety; busy: boolean; previewStyle: DogStyleId;
  edit: (update: (current: AppearanceConfig) => AppearanceConfig, message?: string) => void;
  select: (id: string) => void;
  inherit: () => void;
}) {
  const id = useId();
  const originalColors = isPremiumDogStyleId(previewStyle) || isOriginalArtDogStyleId(previewStyle) || isNativeSceneStyle(previewStyle);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const varieties = (config.varieties ?? []).filter(item => item.breed === breed);
  const breedName = styleBreeds.find(item => item.id === breed)?.name;
  const breedFull = varieties.length >= 20;
  const totalFull = (config.varieties ?? []).length >= 140;
  const full = breedFull || totalFull;
  const presets = shibaCoatPresets.filter(preset => preset.breed === breed);

  function choosePreset(preset: DogCoatPreset) {
    if (busy) return;
    try {
      const result = addCoatPreset(config, preset);
      if (result.added) edit(current => addCoatPreset(current, preset).config, `‘${preset.name}’를 종류에 추가했어요. 아래에서 ‘이 종류를 견종에 적용’을 누르고 저장해 주세요.`);
      else edit(current => current, `이미 등록한 ‘${result.variety.name}’를 선택했어요. 저장해 둔 색과 무늬는 그대로 유지해요.`);
      select(result.variety.id); setProblem("");
    } catch (problem) { setProblem(problem instanceof Error ? problem.message : "종류를 추가하지 못했어요."); }
  }

  function add(rawName: string, shape: DogVariety["shape"] = "original") {
    if (busy || full) return;
    const nextName = rawName.trim();
    if (!nextName || [...nextName].length > 24) { setProblem("종류 이름을 1~24자로 입력해 주세요."); return; }
    if (varieties.some(item => item.name.trim().replace(/\s+/gu, " ").toLowerCase() === nextName.replace(/\s+/gu, " ").toLowerCase())) {
      setProblem("이 견종에 같은 이름의 종류가 있어요."); return;
    }
    const variety: DogVariety = { ...defaultVariantLook, id: crypto.randomUUID(), breed, name: nextName, style: null, shape };
    edit(current => ({ ...current, varieties: [...(current.varieties ?? []), variety] }), `‘${nextName}’ 종류를 추가했어요. 모습을 정한 뒤 견종에 적용할 수 있어요.`);
    select(variety.id); setName(""); setProblem("");
  }
  function update(patch: Partial<Pick<DogVariety, "name" | "shape" | "pattern" | "coatColor" | "patternColor" | "style">>) {
    if (!selected) return;
    edit(current => ({ ...current, varieties: (current.varieties ?? []).map(item => item.id === selected.id ? { ...item, ...patch } : item) }));
    setProblem("");
  }
  function remove() {
    if (!selected) return;
    edit(current => {
      const breedVarieties = { ...current.breedVarieties };
      if (breedVarieties[breed] === selected.id) delete breedVarieties[breed];
      return { ...current, breedVarieties, varieties: (current.varieties ?? []).filter(item => item.id !== selected.id) };
    }, `‘${selected.name}’ 종류를 삭제할 예정이에요. 적용 중이었다면 기본형으로 돌아가요. 저장 전에는 되돌릴 수 있어요.`);
    select(""); setProblem("");
  }

  return <section className="admin-dog-varieties" aria-label="종류 관리">
    <div className="admin-dog-variety-heading">
      <div><h3>{breedName} <span aria-hidden="true">›</span> {selected?.name || "기본형"}</h3><p>견종 종류 {varieties.length}/20개 · 전체 {(config.varieties ?? []).length}/140개 · 모양과 무늬를 정하고 아래에서 도트를 골라요.</p></div>
      <div className="admin-dog-quick-add">
        <button type="button" className="account-button account-button-soft" disabled={busy || full || varieties.some(item => item.name === "곰돌이형")} onClick={() => add("곰돌이형", "teddy")}><Plus size={14} /> 곰돌이형 추가</button>
        <button type="button" className="account-button account-button-soft" disabled={busy || full || varieties.some(item => item.name === "여우형")} onClick={() => add("여우형", "fox")}><Plus size={14} /> 여우형 추가</button>
      </div>
    </div>
    {presets.length > 0 && <section className="admin-dog-coat-presets" aria-labelledby={`${id}-presets`}>
      <div className="admin-dog-coat-heading"><div><h4 id={`${id}-presets`}>시바견 색상·무늬 10종</h4><p>마음에 드는 모습을 누르면 내 종류에 추가돼요. 추가한 종류는 다시 선택할 수 있어요.</p></div><span>도트 색상 견본</span></div>
      <div className="admin-dog-coat-grid">{presets.map(preset => {
        const existing = findCoatPresetVariety(config, preset);
        const active = Boolean(existing && existing.id === selected?.id);
        return <button key={preset.id} type="button" className="admin-dog-coat-card" aria-label={`${preset.name} ${existing ? "선택" : "종류 추가"}`} aria-pressed={active} disabled={busy || (full && !existing)} onClick={() => choosePreset(preset)}>
          <span className="admin-dog-coat-mark" aria-hidden="true">{active && <Check size={13} />}</span>
          <span className="admin-dog-coat-art"><PixelDog breed={preset.breed} styleId={originalColors ? "classic" : previewStyle} variant={preset} decorative /></span>
          <strong>{preset.name}</strong><small>{preset.description}</small>
          <span className="admin-dog-coat-card-action">{existing ? <Check size={12} /> : <Plus size={12} />}{existing ? "추가됨 · 선택" : "종류에 추가"}</span>
        </button>;
      })}</div>
      <p className="admin-dog-coat-note">{originalColors ? "색상 견본은 클래식 도트예요. 선택한 스타일은 원래 그림의 색과 무늬를 유지해요." : "추가 후 색과 무늬를 더 바꿀 수 있어요."} 실제 견종 적용은 아래 적용 버튼과 ‘변경사항 저장’으로 마쳐 주세요.</p>
    </section>}
    {full && <p className="admin-dog-coat-note" role="status">{totalFull ? "전체 종류가 140개예요." : "이 견종의 종류가 20개예요."} 이미 추가한 종류는 선택할 수 있고, 새 종류를 넣으려면 사용하지 않는 종류를 지워 주세요.</p>}
    <div className="admin-dog-variety-add">
      <label className="account-field" htmlFor={`${id}-new-name`}><span>새 종류 이름</span><input id={`${id}-new-name`} value={name} maxLength={48} placeholder="예: 크림 곰돌이, 얼룩 여우" disabled={busy || full} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(name); } }} /></label>
      <button type="button" className="account-button account-button-soft" disabled={busy || full || !name.trim()} onClick={() => add(name)}><Plus size={15} /> 종류 추가</button>
    </div>
    {problem && <p className="admin-dog-variety-error" role="alert">{problem}</p>}
    {selected && <fieldset className="admin-dog-variety-editor" disabled={busy}>
      <legend>{selected.name || "새 종류"} 모습 설정</legend>
      <label className="account-field"><span>종류 이름</span><input value={selected.name} maxLength={48} onChange={event => update({ name: event.target.value })} /></label>
      <label className="account-field"><span>얼굴·귀 모양</span><select disabled={originalColors} value={selected.shape} onChange={event => update({ shape: event.target.value as DogVariety["shape"] })}>{shapes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="account-field"><span>털 무늬</span><select disabled={originalColors} value={selected.pattern} onChange={event => update({ pattern: event.target.value as DogVariety["pattern"] })}>{patterns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="account-field admin-dog-coat-field"><span>털 색상</span><label className="admin-dog-color-default"><input type="checkbox" disabled={originalColors} checked={selected.coatColor === null} onChange={event => update({ coatColor: event.target.checked ? null : "#EBC18E" })} /> 견종 기본색</label><label className="admin-dog-color-picker"><input aria-label="종류 털 색상" type="color" value={selected.coatColor ?? "#EBC18E"} disabled={busy || originalColors || selected.coatColor === null} onChange={event => update({ coatColor: event.target.value.toUpperCase() })} /><span>{selected.coatColor ?? "기본색 사용"}</span></label></div>
      <label className="account-field"><span>무늬 색상</span><span className="admin-dog-color-picker"><input type="color" aria-label="종류 무늬 색상" value={selected.patternColor} disabled={busy || originalColors || selected.pattern === "solid"} onChange={event => update({ patternColor: event.target.value.toUpperCase() })} /><span>{selected.patternColor}</span></span></label>
      <div className="admin-dog-variety-actions"><button type="button" className="account-button account-button-soft" onClick={() => { update({ style: null }); inherit(); }} disabled={busy || selected.style === null}>견종 스타일 물려받기</button><button type="button" className="admin-dog-delete" onClick={remove}><Trash2 size={14} /> 이 종류 삭제</button></div>
      <p className="admin-dog-variety-help">종류마다 스타일을 저장할 수 있어요. 사이트에는 견종마다 한 종류를 선택해 적용해요. {originalColors ? "선택한 도트는 원본 색상과 모양을 유지해요. 다른 도트 스타일을 고르면 색과 무늬를 편집할 수 있어요." : "강아지별로 꾸민 털색은 우선해서 표시돼요."}</p>
    </fieldset>}
  </section>;
}


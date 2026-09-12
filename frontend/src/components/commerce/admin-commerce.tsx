"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RefreshCw, RotateCcw, Save, Store } from "lucide-react";
import { AccountError, accountErrorMessage, adminFetch, isAccountAccessError } from "@/lib/account";
import { commerceDate, commerceKindName, commerceKinds, commerceMoney, relativeProbabilities, type CommerceCatalog, type CommerceKind } from "@/lib/commerce";
import { AccountFailure, AccountLoading, AccountNotice, SubmitLabel } from "@/components/account/account-ui";
import { CosmeticPreview } from "@/components/cosmetic-preview";
import { PuppySprite } from "@/components/puppy-sprite";

type CatalogDraft = {
  salesEnabled: boolean;
  products: { id: string; price: string; enabled: boolean }[];
  pools: { kind: CommerceKind; entries: { id: string; weight: string }[] }[];
};

function toDraft(catalog: CommerceCatalog): CatalogDraft {
  return {
    salesEnabled: catalog.salesEnabled,
    products: catalog.products.map(product => ({ id: product.id, price: String(product.price), enabled: product.enabled })),
    pools: catalog.pools.map(pool => ({ kind: pool.kind, entries: pool.entries.map(entry => ({ id: entry.id, weight: String(entry.weight) })) })),
  };
}

function integerValue(value: string, minimum = 0): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= 1_000_000 ? number : null;
}

function draftProblem(draft: CatalogDraft): string {
  if (draft.products.some(product => integerValue(product.price, 100) === null)) return "모든 상품 가격을 100원부터 1,000,000원 사이의 정수로 입력해 주세요.";
  for (const pool of draft.pools) {
    if (pool.entries.some(entry => integerValue(entry.weight) === null)) return `${commerceKindName(pool.kind)} 가중치는 0부터 1,000,000 사이의 정수로 입력해 주세요.`;
    if (!pool.entries.some(entry => Number(entry.weight) > 0)) return `${commerceKindName(pool.kind)}에서 최소 한 항목의 가중치는 0보다 커야 해요.`;
  }
  return "";
}

function changedFields(saved: CommerceCatalog, draft: CatalogDraft): number {
  return Number(saved.salesEnabled !== draft.salesEnabled)
    + draft.products.reduce((sum, product) => {
      const original = saved.products.find(item => item.id === product.id);
      return sum + Number(original?.price !== Number(product.price)) + Number(original?.enabled !== product.enabled);
    }, 0)
    + draft.pools.reduce((sum, pool) => sum + pool.entries.filter(entry => {
      const original = saved.pools.find(item => item.kind === pool.kind)?.entries.find(item => item.id === entry.id);
      return original?.weight !== Number(entry.weight) || integerValue(entry.weight) === null;
    }).length, 0);
}

export function AdminCommerce({ onAccessError }: { onAccessError: (problem: unknown) => void }) {
  const id = useId();
  const [saved, setSaved] = useState<CommerceCatalog | null>(null);
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [poolKind, setPoolKind] = useState<CommerceKind>("dog");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const alive = useRef(false);
  const working = useRef(false);

  const accept = useCallback((catalog: CommerceCatalog) => {
    setSaved(catalog); setDraft(toDraft(catalog)); setConflict(false); setConfirmReload(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    const controller = new AbortController();
    adminFetch<CommerceCatalog>("commerce/catalog", undefined, controller.signal)
      .then(catalog => { if (!disposed) accept(catalog); })
      .catch(problem => {
        if (disposed) return;
        if (isAccountAccessError(problem)) onAccessError(problem);
        else setError(accountErrorMessage(problem));
      })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; alive.current = false; controller.abort(); };
  }, [accept, onAccessError]);

  const busy = loading || saving;
  const changes = saved && draft ? changedFields(saved, draft) : 0;
  const validation = draft ? draftProblem(draft) : "";

  function edit(update: (current: CatalogDraft) => CatalogDraft) {
    if (busy) return;
    setDraft(current => current ? update(current) : current);
    setMessage(""); if (!conflict) setError(""); setConfirmReload(false);
  }

  async function reload() {
    if (working.current) return;
    working.current = true; setLoading(true); setError(""); setMessage("");
    try {
      const catalog = await adminFetch<CommerceCatalog>("commerce/catalog");
      if (!alive.current) return;
      accept(catalog); setMessage("최신 상품·확률 설정을 불러왔어요.");
    } catch (problem) {
      if (!alive.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setError(accountErrorMessage(problem));
    } finally { working.current = false; if (alive.current) setLoading(false); }
  }

  async function save() {
    if (!saved || !draft || !changes || validation || conflict || busy || working.current) return;
    working.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const catalog = await adminFetch<CommerceCatalog>("commerce/catalog", {
        expectedRevision: saved.revision, salesEnabled: draft.salesEnabled,
        products: draft.products.map(product => ({ ...product, price: Number(product.price) })),
        pools: draft.pools.map(pool => ({ kind: pool.kind, entries: pool.entries.map(entry => ({ id: entry.id, weight: Number(entry.weight) })) })),
      });
      if (!alive.current) return;
      accept(catalog); setMessage("뽑기권 상품과 확률 설정을 저장했어요.");
    } catch (problem) {
      if (!alive.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else if (problem instanceof AccountError && problem.status === 409) {
        setConflict(true); setConfirmReload(true);
        setError("다른 곳에서 설정을 먼저 저장했어요. 작성 중인 변경은 유지했어요. 최신 설정을 불러온 뒤 다시 수정해 주세요.");
      } else setError(accountErrorMessage(problem));
    } finally { working.current = false; if (alive.current) setSaving(false); }
  }

  if (!saved || !draft) return <section className="commerce-card">
    {loading ? <AccountLoading label="상품과 확률 설정을 불러오고 있어요." /> : <AccountFailure message={error || "설정을 불러오지 못했어요."} retry={() => void reload()} />}
  </section>;

  const selectedPool = draft.pools.find(pool => pool.kind === poolKind);
  const originalPool = saved.pools.find(pool => pool.kind === poolKind);
  const weights = selectedPool?.entries.map(entry => integerValue(entry.weight) ?? NaN) ?? [];
  const probabilities = relativeProbabilities(weights);
  const weightTotal = weights.every(Number.isFinite) ? weights.reduce((sum, weight) => sum + weight, 0) : null;

  return (
    <section className="admin-commerce" aria-labelledby={`${id}-heading`} aria-busy={busy}>
      <div className="commerce-card">
        <div className="commerce-heading">
          <div><span className="account-kicker"><Store size={14} aria-hidden="true" /> SHOP SETTINGS</span><h2 id={`${id}-heading`}>뽑기·상품 설정</h2><p>판매 여부와 가격, 종류별 획득 확률을 관리해요.</p></div>
          <button type="button" className="account-button account-button-soft" disabled={busy} onClick={() => { if (changes || conflict) setConfirmReload(true); else void reload(); }}><RefreshCw size={15} aria-hidden="true" /> 최신 설정 불러오기</button>
        </div>
        <AccountNotice>화면에서 수정한 값은 저장 전까지 반영되지 않아요. 기존 결제 주문의 가격과 이미 완료된 뽑기 결과는 바뀌지 않아요.</AccountNotice>
        <label className="commerce-sales-toggle" htmlFor={`${id}-sales`}>
          <input id={`${id}-sales`} type="checkbox" checked={draft.salesEnabled} disabled={busy} onChange={event => edit(current => ({ ...current, salesEnabled: event.target.checked }))} />
          <span><strong>뽑기권 판매 {draft.salesEnabled ? "켜짐" : "꺼짐"}</strong><small>판매를 켜면 구매 가능한 상품이 공개돼요. 결제 서비스가 준비되어 있어야 결제할 수 있어요.</small></span>
        </label>
        <p className="commerce-note">판매를 꺼도 이미 보유한 뽑기권의 사용은 유지돼요.</p>
      </div>
      <AccountNotice kind="error">{error}</AccountNotice>
      <AccountNotice kind="success">{message}</AccountNotice>
      {confirmReload && <div className="commerce-card commerce-reload-confirm">
        <p>작성 중인 변경을 버리고 마지막으로 저장된 상품·확률 설정을 불러와요.</p>
        <div><button type="button" className="account-button account-button-soft" disabled={busy} onClick={() => setConfirmReload(false)}>계속 수정하기</button><button type="button" className="account-button" disabled={busy} onClick={() => void reload()}><SubmitLabel busy={loading}>변경을 버리고 최신 설정 불러오기</SubmitLabel></button></div>
      </div>}

      <section className="commerce-card" aria-labelledby={`${id}-products-heading`}>
        <div className="commerce-section-heading"><div><h2 id={`${id}-products-heading`}>뽑기권 상품</h2><p>종류와 수량은 고정돼요. 상품별 가격과 판매 여부를 수정할 수 있어요.</p></div></div>
        <div className="admin-commerce-product-grid">
          {draft.products.map(product => {
            const original = saved.products.find(item => item.id === product.id)!;
            const invalid = integerValue(product.price, 100) === null;
            return <article className="admin-commerce-product" key={product.id}>
              <span className="commerce-eyebrow">{commerceKindName(original.kind)} · {original.quantity}장</span>
              <h3>{original.name}</h3>
              <label className="commerce-field" htmlFor={`${id}-price-${product.id}`}><span>판매 가격 (원)</span>
                <input id={`${id}-price-${product.id}`} value={product.price} inputMode="numeric" maxLength={8} disabled={busy} aria-invalid={invalid} aria-describedby={`${id}-price-help`} onChange={event => {
                  const value = event.target.value;
                  edit(current => ({ ...current, products: current.products.map(item => item.id === product.id ? { ...item, price: value } : item) }));
                }} />
              </label>
              <label className="commerce-checkbox"><input type="checkbox" checked={product.enabled} disabled={busy} onChange={event => edit(current => ({ ...current, products: current.products.map(item => item.id === product.id ? { ...item, enabled: event.target.checked } : item) }))} /><span>이 상품 판매 허용</span></label>
              <small className="commerce-note">현재 저장된 가격 {commerceMoney(original.price)}</small>
            </article>;
          })}
        </div>
        <p id={`${id}-price-help`} className="commerce-note">가격은 100원~1,000,000원 사이의 정수로 입력해 주세요.</p>
      </section>

      <section className="commerce-card" aria-labelledby={`${id}-weights-heading`}>
        <div className="commerce-section-heading"><div><h2 id={`${id}-weights-heading`}>종류별 획득 확률</h2><p>가중치가 클수록 나올 확률이 높아져요. 0으로 설정한 항목은 나오지 않아요.</p></div></div>
        <nav className="commerce-kind-tabs" aria-label="확률을 편집할 뽑기 종류">{commerceKinds.map(kind => <button type="button" key={kind.id} aria-pressed={poolKind === kind.id} onClick={() => setPoolKind(kind.id)}>{kind.name}</button>)}</nav>
        <div className="admin-commerce-weight-summary"><strong>가중치 합계 {weightTotal === null ? "확인 필요" : weightTotal.toLocaleString()}</strong><span>{weightTotal && probabilities.every(value => value !== "—") ? "표시 확률 합계 100%" : "유효한 가중치를 입력해 주세요"}</span></div>
        <p id={`${id}-weight-help`} className="commerce-note">각 항목은 0~1,000,000 사이의 정수여야 해요. 종류마다 최소 한 항목은 0보다 커야 합니다.</p>
        <div className="commerce-table-wrap admin-commerce-weight-table" role="region" aria-label={`${commerceKindName(poolKind)} 확률 편집 표. 작은 화면에서는 좌우로 스크롤할 수 있어요.`} tabIndex={0}><table>
          <caption className="account-sr-only">{commerceKindName(poolKind)} 가중치와 저장 전 확률</caption>
          <thead><tr><th scope="col">획득 항목</th><th scope="col">등급</th><th scope="col">가중치</th><th scope="col">저장 전 확률</th></tr></thead>
          <tbody>{selectedPool?.entries.map((entry, index) => {
            const original = originalPool?.entries.find(item => item.id === entry.id);
            return <tr key={entry.id}>
              <th scope="row">
                <div className="commerce-entry-label">
                  {original && <div className="commerce-entry-preview" aria-hidden="true">
                    {poolKind !== "dog" && original.itemId
                      ? <CosmeticPreview kind={poolKind} itemId={original.itemId} />
                      : <PuppySprite puppy={{ breed: original.breed ?? 0 }} decorative />}
                  </div>}
                  <span>{original?.label ?? entry.id}</span>
                </div>
              </th>
              <td>{original?.grade}</td>
              <td><input
                className="commerce-weight-input" inputMode="numeric" maxLength={8} value={entry.weight} disabled={busy}
                aria-label={`${original?.label ?? entry.id} 가중치`} aria-describedby={`${id}-weight-help`} aria-invalid={integerValue(entry.weight) === null}
                onChange={event => { const value = event.target.value; edit(current => ({ ...current, pools: current.pools.map(pool => pool.kind === poolKind ? { ...pool, entries: pool.entries.map(item => item.id === entry.id ? { ...item, weight: value } : item) } : pool) })); }}
              /></td><td>{probabilities[index]}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <p className="commerce-note">표시되는 마지막 소수 자리는 합계가 100%가 되도록 조정해요. 실제 뽑기는 저장된 가중치 비율을 사용해요.</p>
      </section>
      {validation && <AccountNotice kind="error">{validation}</AccountNotice>}
      <div className="commerce-savebar">
        <div role="status"><strong>{conflict ? "최신 설정 확인이 필요해요" : changes ? `저장하지 않은 변경 ${changes}곳` : "저장된 설정과 같아요"}</strong><span>{saved.updatedAt ? `마지막 저장 · ${commerceDate(saved.updatedAt)}` : "초기 상품·확률 설정"}</span></div>
        <div className="commerce-save-actions">
          <button type="button" className="account-button account-button-soft" disabled={busy || !changes} onClick={() => { setDraft(toDraft(saved)); setMessage(""); if (!conflict) setError(""); setConfirmReload(false); }}><RotateCcw size={15} aria-hidden="true" /> 변경 되돌리기</button>
          <button type="button" className="account-button" disabled={busy || !changes || !!validation || conflict} onClick={() => void save()}>{!saving && <Save size={15} aria-hidden="true" />}<SubmitLabel busy={saving}>{saving ? "저장 중…" : "변경사항 저장"}</SubmitLabel></button>
        </div>
      </div>
    </section>
  );
}

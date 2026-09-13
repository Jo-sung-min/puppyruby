"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, History, Package, PawPrint, RefreshCw, Sparkles, Ticket } from "lucide-react";
import { CosmeticPreview } from "@/components/cosmetic-preview";
import { PuppySprite } from "@/components/puppy-sprite";
import { AccountAccess, AccountFailure, AccountLoading, AccountNotice, SubmitLabel } from "@/components/account/account-ui";
import { useAccountSession } from "@/components/account/use-account-session";
import { AccountError, accountErrorMessage, isAccountAccessError } from "@/lib/account";
import { breeds, requestGame, type ActionResult, type GameState, type Puppy } from "@/lib/game";
import {
  checkedDrawResult, commerceDate, commerceFetch, commerceKindName, commerceKinds, commerceMoney, paymentsFetch,
  paymentStatusLabel, probabilityText,
  type CommerceCatalog, type CommerceDrawResult, type CommerceKind, type CommercePool,
  type CommerceReward, type CommerceWallet, type CosmeticKind, type PaymentConfig,
  type PaymentOrder, type PaymentOrders,
} from "@/lib/commerce";

type PendingDraw = { kind: CommerceKind; requestId: string; catalogRevision: number };

function pendingKey(userId: string) { return `puppyruby-pending-draw:${userId}`; }
function readPending(userId: string): PendingDraw | null {
  try {
    const raw = sessionStorage.getItem(pendingKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const data = value as Record<string, unknown>;
    if (!commerceKinds.some(kind => kind.id === data.kind)
      || typeof data.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(data.requestId)
      || !Number.isSafeInteger(data.catalogRevision) || (data.catalogRevision as number) < 0) return null;
    return data as PendingDraw;
  } catch { return null; }
}
function storePending(userId: string, pending: PendingDraw | null) {
  try {
    if (pending) sessionStorage.setItem(pendingKey(userId), JSON.stringify(pending));
    else sessionStorage.removeItem(pendingKey(userId));
  } catch { /* The active page still retains the same request for a retry. */ }
}

export function PuppyShop({ embedded = false, onGameChanged }: { embedded?: boolean; onGameChanged?: (game: GameState) => void }) {
  const auth = useAccountSession();
  const [kind, setKind] = useState<CommerceKind>("dog");
  const [catalog, setCatalog] = useState<CommerceCatalog | null>(null);
  const [payment, setPayment] = useState<PaymentConfig | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [revision, setRevision] = useState(0);
  const [accessError, setAccessError] = useState<AccountError | null>(null);
  const refreshCatalog = useCallback(() => setRevision(value => value + 1), []);
  const onAccessError = useCallback((problem: unknown) => {
    if (problem instanceof AccountError) setAccessError(problem);
  }, []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    Promise.allSettled([
      commerceFetch<CommerceCatalog>("catalog", undefined, controller.signal),
      paymentsFetch<PaymentConfig>("config", undefined, controller.signal),
    ]).then(([catalogResult, paymentResult]) => {
      if (disposed) return;
      if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
      else setCatalogError(accountErrorMessage(catalogResult.reason));
      if (paymentResult.status === "fulfilled") { setPayment(paymentResult.value); setPaymentError(""); }
      else { setPayment(null); setPaymentError("결제 가능 여부를 확인하지 못했어요. 다시 불러온 뒤 이용해 주세요."); }
      setCatalogLoading(false);
    });
    return () => { disposed = true; controller.abort(); };
  }, [revision]);

  useEffect(() => { setAccessError(null); }, [auth.session?.user?.id]);

  const user = auth.session?.user;
  const signedIn = !!user && user.status === "ACTIVE" && !auth.loading && !auth.error && !accessError;
  const publicCatalog = catalog && (
    <ShopCatalog
      catalog={catalog} kind={kind} payment={payment} paymentError={paymentError}
      signedIn={signedIn} stale={!!catalogError || catalogLoading}
    />
  );

  return (
    <div className={`commerce-shop${embedded ? " commerce-shop-embedded" : ""}`}>
      <div className="commerce-heading">
        <div>
          <span className="account-kicker"><PawPrint size={14} aria-hidden="true" /> PUPPYRUBY SHOP</span>
          <h1>작은 친구의 상점</h1>
          <p>만나고, 빛을 더하고, 마음에 드는 모습으로 꾸며요.</p>
        </div>
        {!embedded && <Link className="account-text-link" href="/play">내 강아지 만나러 가기</Link>}
      </div>
      <nav className="commerce-kind-tabs" aria-label="뽑기 종류">
        {commerceKinds.map(item => (
          <button type="button" key={item.id} aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>
            {item.id === "dog" ? <PawPrint size={17} aria-hidden="true" /> : item.id === "aura" ? <Sparkles size={17} aria-hidden="true" /> : <Package size={17} aria-hidden="true" />}
            {item.name}
          </button>
        ))}
      </nav>
      {catalogError && <AccountFailure message={catalogError} retry={refreshCatalog} />}
      {!catalog && catalogLoading ? <AccountLoading label="상점을 준비하고 있어요." /> : catalog && <>
        {auth.loading ? <AccountLoading label="보유한 뽑기권을 확인하고 있어요." />
          : accessError ? <AccountAccess forbidden={accessError.status === 403} />
            : auth.forbidden || user?.status === "SUSPENDED" ? <AccountAccess suspended />
              : auth.error && !auth.unauthorized ? <AccountFailure message={accountErrorMessage(auth.error)} retry={auth.refresh} />
                : !signedIn && <div className="commerce-login-note">
                  <div><strong>로그인하고 내 보관함을 열어요</strong><p>확률과 상품은 누구나 볼 수 있어요. 구매·뽑기·꾸미기는 로그인 후 이용해 주세요.</p></div>
                  <Link className="account-button" href="/account">로그인</Link>
                </div>}
        {signedIn && user ? (
          <MemberShop
            key={user.id} userId={user.id} kind={kind} catalog={catalog} catalogReady={!catalogError && !catalogLoading}
            onGameChanged={onGameChanged} onAccessError={onAccessError} refreshCatalog={refreshCatalog}
          >{publicCatalog}</MemberShop>
        ) : publicCatalog}
      </>}
    </div>
  );
}

function ShopCatalog({ catalog, kind, payment, paymentError, signedIn, stale }: {
  catalog: CommerceCatalog; kind: CommerceKind; payment: PaymentConfig | null; paymentError: string; signedIn: boolean; stale: boolean;
}) {
  const pool = catalog.pools.find(item => item.kind === kind);
  const canBuy = catalog.salesEnabled && payment?.enabled && !stale;
  return (
    <>
      <section className="commerce-card" aria-label={`${commerceKindName(kind)} 뽑기권 상품`}>
        <div className="commerce-section-heading"><div><h2>뽑기권 구매</h2><p>결제 전에 상품과 금액, 구매 안내를 한 번 더 확인해요.</p></div><Ticket size={22} aria-hidden="true" /></div>
        {!catalog.salesEnabled && <AccountNotice>지금은 뽑기권 판매를 준비하고 있어요. 이미 가진 뽑기권은 사용할 수 있어요.</AccountNotice>}
        {paymentError ? <AccountNotice kind="error">{paymentError}</AccountNotice>
          : catalog.salesEnabled && !payment?.enabled && <AccountNotice>{payment?.message || "결제는 아직 준비 중이에요."}</AccountNotice>}
        <div className="commerce-products">
          {catalog.products.filter(product => product.kind === kind).map(product => (
            <article className="commerce-product" key={product.id}>
              <span className="commerce-product-quantity"><Ticket size={21} aria-hidden="true" /> {product.quantity}장</span>
              <h3>{product.name}</h3>
              <strong className="commerce-price">{commerceMoney(product.price)}</strong>
              <p>{commerceKindName(kind)} 뽑기 {product.quantity}회 · 1회에 1장</p>
              {!product.enabled && <span className="commerce-note">판매 중지된 상품이에요.</span>}
              {stale ? <button type="button" className="account-button account-button-soft" disabled>상품 정보 확인 중</button>
                : <Link className={`account-button${!canBuy || !product.enabled ? " account-button-soft" : ""}`} href={signedIn ? `/checkout?product=${encodeURIComponent(product.id)}` : "/account"}>{signedIn ? canBuy && product.enabled ? "구매 안내 보기" : "상품 안내 보기" : "로그인하고 상품 보기"}</Link>}
            </article>
          ))}
        </div>
      </section>
      {pool && <ProbabilityPanel pool={pool} revision={catalog.revision} />}
    </>
  );
}

function ProbabilityPanel({ pool, revision }: { pool: CommercePool; revision: number }) {
  return (
    <details className="commerce-card commerce-probabilities">
      <summary><span><strong>전체 획득 확률</strong><small>{pool.entries.length}개 항목 · {pool.name}</small></span><ChevronDown size={18} aria-hidden="true" /></summary>
      <p>뽑기마다 아래 확률을 따르며, 같은 결과가 다시 나올 수 있어요. {pool.kind === "dog" ? "강아지는 새 친구로 합류해요." : "중복 치장품·아우라는 보유 수량에 추가돼요."}</p>
      <div className="commerce-table-wrap" role="region" aria-label={`${pool.name} 획득 확률 표`} tabIndex={0}><table>
        <caption className="account-sr-only">{pool.name} 전체 획득 확률, 설정 버전 {revision}</caption>
        <thead><tr><th scope="col">획득 항목</th><th scope="col">등급</th><th scope="col">확률</th></tr></thead>
        <tbody>{pool.entries.map(entry => (
          <tr key={entry.id}>
            <th scope="row">
              <div className="commerce-entry-label">
                <div className="commerce-entry-preview" aria-hidden="true">
                  {pool.kind !== "dog" && entry.itemId
                    ? <CosmeticPreview kind={pool.kind} itemId={entry.itemId} />
                    : <PuppySprite puppy={{ breed: entry.breed ?? 0 }} decorative />}
                </div>
                <span>{entry.label}</span>
              </div>
            </th>
            <td>{entry.grade}</td>
            <td>{probabilityText(entry.probability)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <small className="commerce-note">표시 확률은 소수점 반올림으로 합계가 100%와 조금 다를 수 있어요.</small>
    </details>
  );
}

function MemberShop({ userId, kind, catalog, catalogReady, children, onGameChanged, onAccessError, refreshCatalog }: {
  userId: string; kind: CommerceKind; catalog: CommerceCatalog; catalogReady: boolean; children: ReactNode;
  onGameChanged?: (game: GameState) => void; onAccessError: (problem: unknown) => void; refreshCatalog: () => void;
}) {
  const [wallet, setWallet] = useState<CommerceWallet | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [error, setError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingDraw | null>(null);
  const [reward, setReward] = useState<CommerceReward | null>(null);
  const [puppyId, setPuppyId] = useState("");
  const alive = useRef(false);
  const working = useRef(false);
  const readVersion = useRef(0);
  const ordersVersion = useRef(0);
  const pendingRef = useRef<PendingDraw | null>(null);
  const gameChanged = useRef(onGameChanged);
  const ordersNode = useRef<HTMLDetailsElement>(null);
  const inventoryNode = useRef<HTMLElement>(null);
  useEffect(() => { gameChanged.current = onGameChanged; }, [onGameChanged]);

  const refreshWallet = useCallback(async (preserveError = false) => {
    if (working.current) return;
    const request = ++readVersion.current;
    setLoading(true);
    if (!preserveError) setError("");
    try {
      const [nextWallet, nextGame] = await Promise.all([
        commerceFetch<CommerceWallet>("me"), requestGame<GameState>(),
      ]);
      if (!alive.current || request !== readVersion.current) return;
      setWallet(nextWallet); setGame(nextGame);
      setPuppyId(current => nextGame.puppies.some(puppy => puppy.id === current) ? current : nextGame.selectedId);
    } catch (problem) {
      if (!alive.current || request !== readVersion.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setError(accountErrorMessage(problem));
    } finally {
      if (alive.current && request === readVersion.current) setLoading(false);
    }
  }, [onAccessError]);

  const refreshOrders = useCallback(async () => {
    const request = ++ordersVersion.current;
    setOrdersLoading(true); setOrdersError("");
    try {
      const result = await paymentsFetch<PaymentOrders>("orders");
      if (alive.current && request === ordersVersion.current) setOrders(result.orders);
    } catch (problem) {
      if (!alive.current || request !== ordersVersion.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setOrdersError(accountErrorMessage(problem));
    } finally {
      if (alive.current && request === ordersVersion.current) setOrdersLoading(false);
    }
  }, [onAccessError]);

  useEffect(() => {
    alive.current = true;
    const previous = readPending(userId);
    pendingRef.current = previous; setPending(previous);
    void refreshWallet(); void refreshOrders();
    return () => { alive.current = false; readVersion.current++; ordersVersion.current++; };
  }, [userId, refreshWallet, refreshOrders]);

  useEffect(() => {
    function revealOrders() {
      if (window.location.hash !== "#orders") return;
      setOrdersOpen(true);
      ordersNode.current?.scrollIntoView({ block: "start" });
    }
    revealOrders();
    window.addEventListener("hashchange", revealOrders);
    return () => window.removeEventListener("hashchange", revealOrders);
  }, []);

  const inventoryReady = !!wallet && !!game;
  useEffect(() => {
    if (!inventoryReady) return;
    function revealInventory() {
      if (window.location.hash === "#inventory") inventoryNode.current?.scrollIntoView({ block: "start" });
    }
    revealInventory();
    window.addEventListener("hashchange", revealInventory);
    return () => window.removeEventListener("hashchange", revealInventory);
  }, [inventoryReady]);

  function updatePending(value: PendingDraw | null) {
    pendingRef.current = value; storePending(userId, value);
    if (alive.current) setPending(value);
  }

  async function draw(retry = false) {
    if (working.current || loading || !wallet) return;
    let intent = pendingRef.current;
    if (!retry && intent) return;
    if (!intent) {
      if (retry || !catalogReady || wallet.balanceHold || wallet.tickets[kind] < 1) return;
      intent = { kind, requestId: crypto.randomUUID(), catalogRevision: catalog.revision };
      updatePending(intent);
    }
    working.current = true; setBusy(true); setError(""); setMessage("");
    readVersion.current++;
    let refreshAfterFailure = false;
    try {
      const result = checkedDrawResult(await commerceFetch<CommerceDrawResult>("draw", { ...intent }), intent.kind);
      updatePending(null);
      if (!alive.current) return;
      setWallet(result.wallet); setReward(result.reward); setGame(result.game);
      setPuppyId(result.game.selectedId);
      gameChanged.current?.(result.game);
    } catch (problem) {
      const definite = problem instanceof AccountError && problem.status >= 400 && problem.status < 500 && problem.status !== 408 && problem.status !== 429;
      if (definite) updatePending(null);
      refreshAfterFailure = definite && !isAccountAccessError(problem);
      if (!alive.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else {
        setError(`${accountErrorMessage(problem)}${definite ? "" : " 새 뽑기를 진행하지 않고, 아래에서 같은 요청의 결과를 다시 확인해 주세요."}`);
        if (problem instanceof AccountError && problem.status === 409) refreshCatalog();
      }
    } finally {
      working.current = false;
      if (alive.current) { setBusy(false); if (refreshAfterFailure) void refreshWallet(true); }
    }
  }

  async function equip(itemKind: CosmeticKind, itemId: string) {
    if (working.current || loading || !puppyId || pendingRef.current) return;
    working.current = true; setBusy(true); setError(""); setMessage(""); readVersion.current++;
    try {
      const result = await commerceFetch<ActionResult>("equip", { puppyId, kind: itemKind, itemId });
      if (!alive.current) return;
      if (!result.success) { setError(result.message); return; }
      setGame(result.state); setMessage(result.message); gameChanged.current?.(result.state);
    } catch (problem) {
      if (!alive.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setError(accountErrorMessage(problem));
    } finally { working.current = false; if (alive.current) setBusy(false); }
  }

  async function reconcile(orderId: string) {
    if (working.current) return;
    working.current = true; setBusy(true); setOrdersError("");
    let confirmed = false;
    try {
      await paymentsFetch(`orders/${encodeURIComponent(orderId)}/reconcile`, {});
      confirmed = true;
      if (alive.current) setMessage("결제 상태를 다시 확인했어요.");
    } catch (problem) {
      if (!alive.current) return;
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setOrdersError(accountErrorMessage(problem));
    } finally {
      working.current = false;
      if (alive.current) { setBusy(false); if (confirmed) { void refreshWallet(); void refreshOrders(); } }
    }
  }

  const pool = catalog.pools.find(item => item.kind === kind);
  const selectedPuppy = game?.puppies.find(puppy => puppy.id === puppyId);
  const drawDisabled = busy || loading || !catalogReady || !wallet || !!pending || wallet.balanceHold
    || wallet.tickets[kind] < 1 || (kind === "dog" && (game?.puppies.length ?? 0) >= 100);
  return (
    <>
      <section className="commerce-card commerce-draw" aria-label={`${commerceKindName(kind)} 뽑기`}>
        <div className="commerce-section-heading">
          <div><h2>{commerceKindName(kind)} 뽑기</h2><p>{commerceKinds.find(item => item.id === kind)?.description}</p></div>
          <button type="button" className="commerce-icon-button" aria-label="보유권 새로고침" disabled={busy || loading} onClick={() => void refreshWallet()}><RefreshCw size={18} aria-hidden="true" /></button>
        </div>
        <AccountNotice kind="error">{error}</AccountNotice>
        <AccountNotice kind="success">{message}</AccountNotice>
        {loading && !wallet ? <AccountLoading label="보유권과 강아지를 불러오고 있어요." /> : wallet && <>
          <div className="commerce-ticket-balances" aria-label="보유 뽑기권">
            {commerceKinds.map(item => <div key={item.id} className={kind === item.id ? "is-current" : ""}><span>{item.name}</span><strong>{Math.max(0, wallet.tickets[item.id]).toLocaleString()}<small>장</small></strong>{wallet.tickets[item.id] < 0 && <span>회수 대기 {Math.abs(wallet.tickets[item.id]).toLocaleString()}장</span>}</div>)}
          </div>
          {wallet.balanceHold && <AccountNotice kind="error">취소·환불된 뽑기권을 확인하고 있어요. 보유 내역이 정리된 후 다시 이용할 수 있어요.</AccountNotice>}
          {pending && <div className="commerce-pending" role="status">
            <p>이전 {commerceKindName(pending.kind)} 뽑기 결과를 확인해야 해요. 같은 요청을 다시 확인하며, 새 뽑기는 시작하지 않아요.</p>
            <button type="button" className="account-button account-button-soft" disabled={busy || loading} onClick={() => void draw(true)}><SubmitLabel busy={busy}>이전 뽑기 결과 다시 확인</SubmitLabel></button>
          </div>}
          <div className="commerce-draw-action">
            <div><strong>한 번에 뽑기권 1장</strong><p>{kind === "dog" ? "최대 100마리까지 함께할 수 있어요." : "같은 아이템은 보유 수량에 추가돼요."}</p></div>
            <button type="button" className="account-button" disabled={drawDisabled} onClick={() => void draw()}><SubmitLabel busy={busy && !!pending}><Ticket size={16} aria-hidden="true" /> 1장으로 1회 뽑기</SubmitLabel></button>
          </div>
          {!wallet.tickets[kind] && <p className="commerce-note">보유한 {commerceKindName(kind)} 뽑기권이 없어요. 아래에서 상품과 전체 확률을 확인할 수 있어요.</p>}
          {kind === "dog" && (game?.puppies.length ?? 0) >= 100 && <AccountNotice>현재 강아지 100마리와 함께하고 있어요. 새 강아지를 더 데려올 수 없어요.</AccountNotice>}
        </>}
      </section>
      {reward && <section className="commerce-card commerce-reward" aria-label="최근 뽑기 결과" role="status">
        <RewardArt reward={reward} />
        <div><span className="commerce-eyebrow">뽑기 결과 · {commerceKindName(reward.kind)}</span><h2>{reward.label}</h2><p>{reward.grade} · {reward.kind === "dog" ? "새 강아지를 선택했어요. 함께 만나러 가요." : reward.duplicate ? "이미 가진 아이템이에요. 보유 수량이 1개 늘었어요." : "보관함에 새 아이템을 추가했어요."}</p>{reward.kind === "dog" && <Link href="/play" className="account-text-link">강아지 만나러 가기</Link>}</div>
      </section>}
      {children}
      {wallet && game && <section id="inventory" ref={inventoryNode} className="commerce-card" aria-labelledby="commerce-inventory-heading">
        <div className="commerce-section-heading"><div><h2 id="commerce-inventory-heading">내 보관함</h2><p>꾸밀 강아지를 고른 뒤 아우라와 치장품을 착용해요.</p></div><Package size={22} aria-hidden="true" /></div>
        <label className="commerce-field commerce-puppy-select"><span>꾸밀 강아지</span><select value={puppyId} disabled={busy || loading || !!pending} onChange={event => setPuppyId(event.target.value)} aria-label="꾸밀 강아지">
          {!game.puppies.length && <option value="">함께하는 강아지가 없어요</option>}
          {game.puppies.map(puppy => <option key={puppy.id} value={puppy.id}>{puppy.name} · {breeds[puppy.breed]?.name ?? "강아지"} · {puppy.grade}</option>)}
        </select></label>
        {(["aura", "accessory"] as const).map(itemKind => {
          const owned = wallet.items.filter(item => item.kind === itemKind && item.count > 0);
          const itemPool = catalog.pools.find(item => item.kind === itemKind);
          const current = equippedItem(selectedPuppy, itemKind);
          return <div className="commerce-inventory-group" key={itemKind}>
            <div className="commerce-inventory-heading"><h3>{commerceKindName(itemKind)}</h3><button type="button" className="account-button account-button-soft" disabled={busy || loading || !!pending || !selectedPuppy || current === "none"} onClick={() => void equip(itemKind, "none")}>{commerceKindName(itemKind)} 해제</button></div>
            {owned.length ? <div className="commerce-item-grid">{owned.map(item => {
              const itemLabel = itemPool?.entries.find(entry => entry.itemId === item.itemId)?.label ?? "보유 아이템";
              const worn = current === item.itemId;
              return <article className="commerce-item" key={item.itemId}>
                <CosmeticPreview kind={itemKind} itemId={item.itemId} breed={selectedPuppy?.breed} />
                <h4>{itemLabel}</h4><p>{item.count}개 보유</p>
                <button type="button" className={`account-button ${worn ? "" : "account-button-soft"}`} disabled={busy || loading || !!pending || !selectedPuppy || worn} onClick={() => void equip(itemKind, item.itemId)}>{worn && <Check size={14} aria-hidden="true" />}{worn ? "착용 중" : "착용"}</button>
              </article>;
            })}</div> : <p className="commerce-empty">아직 보유한 {commerceKindName(itemKind)}가 없어요.</p>}
          </div>;
        })}
      </section>}
      {wallet && <details className="commerce-card commerce-history">
        <summary><span><History size={18} aria-hidden="true" /> 뽑기 내역</span><ChevronDown size={18} aria-hidden="true" /></summary>
        {wallet.history.length ? <ul className="commerce-history-list">{wallet.history.map(item => <li key={item.id}>
          <div><strong>{item.label}</strong><span>{commerceKindName(item.kind)} · {item.grade}{item.duplicate ? " · 중복 획득" : ""}</span></div><time dateTime={new Date(item.createdAt).toISOString()}>{commerceDate(item.createdAt)}</time>
        </li>)}</ul> : <p className="commerce-empty">아직 뽑기 내역이 없어요.</p>}
      </details>}
      <details id="orders" ref={ordersNode} className="commerce-card commerce-history" open={ordersOpen} onToggle={event => setOrdersOpen(event.currentTarget.open)}>
        <summary><span><Ticket size={18} aria-hidden="true" /> 구매 내역</span><ChevronDown size={18} aria-hidden="true" /></summary>
        <AccountNotice kind="error">{ordersError}</AccountNotice>
        <button type="button" className="account-button account-button-soft commerce-orders-refresh" disabled={busy || ordersLoading} onClick={() => void refreshOrders()}><RefreshCw size={14} aria-hidden="true" /> 구매 내역 새로고침</button>
        {ordersLoading ? <AccountLoading label="구매 내역을 불러오고 있어요." /> : !orders.length ? <p className="commerce-empty">아직 구매 내역이 없어요.</p> : <ul className="commerce-order-list">{orders.map(order => <li key={order.orderId}>
          <div className="commerce-order-title"><strong>{order.orderName}</strong><span className="account-badge">{paymentStatusLabel(order.status)}</span></div>
          <p>{commerceMoney(order.amount)} · {order.quantity}장{order.ticketsGranted ? " · 지급됨" : ""}</p>
          <time dateTime={new Date(order.createdAt).toISOString()}>{commerceDate(order.createdAt)}</time>
          {order.refundedAmount > 0 && <p>취소·환불 {commerceMoney(order.refundedAmount)}</p>}
          <div className="commerce-order-actions">
            <button type="button" className="account-button account-button-soft" disabled={busy} onClick={() => void reconcile(order.orderId)}>결제 상태 다시 확인</button>
            {safeReceipt(order.receiptUrl) && <a className="account-text-link" href={safeReceipt(order.receiptUrl)!} target="_blank" rel="noopener noreferrer">영수증 보기</a>}
          </div>
        </li>)}</ul>}
      </details>
      {!wallet && !loading && error && <button type="button" className="account-button account-button-soft" onClick={() => void refreshWallet()}>보유 내역 다시 불러오기</button>}
      {pool && <p className="commerce-footer-note">뽑기권은 종류별로 사용해요. 한 번 뽑을 때 해당 종류의 뽑기권 1장이 소모됩니다.</p>}
    </>
  );
}

function equippedItem(puppy: Puppy | undefined, kind: CosmeticKind): string {
  if (!puppy) return "none";
  if (kind === "accessory") return puppy.accessory || "none";
  return "aura" in puppy && typeof puppy.aura === "string" ? puppy.aura : "none";
}

function RewardArt({ reward }: { reward: CommerceReward }) {
  if (reward.kind !== "dog" && reward.itemId) return <div className="commerce-reward-art"><CosmeticPreview kind={reward.kind} itemId={reward.itemId} /></div>;
  return <div className="commerce-reward-art"><PuppySprite puppy={{ breed: reward.breed ?? 0 }} decorative /></div>;
}

function safeReceipt(value: string | null | undefined): string | null {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

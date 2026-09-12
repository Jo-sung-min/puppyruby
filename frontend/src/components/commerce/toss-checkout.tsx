"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Ticket, ShieldCheck } from "lucide-react";
import { AccountError, authFetch, type AccountSession } from "@/lib/account";
import { commerceFetch, commerceMoney, paymentsFetch, probabilityText, type CommerceCatalog, type PaymentConfig } from "@/lib/commerce";
import { useAccountSession } from "../account/use-account-session";
import { AccountAccess, AccountFailure, AccountLoading, AccountNotice, SubmitLabel } from "../account/account-ui";

type Order = { orderId: string; orderName: string; amount: number; quantity: number; kind: string; customerKey: string; status: string };
type TossSDK = (key: string) => { payment: (customer: { customerKey: string }) => { requestPayment: (options: {
  method: "CARD"; amount: { currency: "KRW"; value: number }; orderId: string; orderName: string;
  successUrl: string; failUrl: string; card: { flowMode: "DIRECT"; easyPay: "TOSSPAY" };
}) => Promise<void> } };
declare global { interface Window { TossPayments?: TossSDK } }

const terms = [
  { label: "전자금융거래 이용약관", href: "https://pages.tosspayments.com/terms/user" },
  { label: "개인(신용)정보 수집·이용", href: "https://pages.tosspayments.com/terms/privacy/consent1" },
  { label: "개인(신용)정보 제3자 제공", href: "https://pages.tosspayments.com/terms/privacy/consent2" },
];
export function TossCheckout({ productId }: { productId: string }) {
  const account = useAccountSession();
  if (account.loading) return <AccountLoading />;
  if (account.error && !account.unauthorized && !account.forbidden) return <AccountFailure message="계정에 연결하지 못했어요." retry={account.refresh} />;
  if (!account.session?.user) return <AccountAccess suspended={account.forbidden} />;
  return <CheckoutForm key={`${account.session.user.id}:${productId}`} productId={productId} userId={account.session.user.id} />;
}
function CheckoutForm({ productId, userId }: { productId: string; userId: string }) {
  const [catalog, setCatalog] = useState<CommerceCatalog | null>(null);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [consents, setConsents] = useState([false, false, false, false]);
  const pending = useRef<{ requestId: string; catalogRevision: number; productId: string } | null>(null);
  const locked = useRef(false);
  const alive = useRef(false), generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setLoadError("");
    try { const [nextCatalog, nextConfig] = await Promise.all([commerceFetch<CommerceCatalog>("catalog"), paymentsFetch<PaymentConfig>("config")]); if (alive.current && generation.current === current) { setCatalog(nextCatalog); setConfig(nextConfig); } }
    catch { if (alive.current && generation.current === current) setLoadError("결제 정보를 불러오지 못했어요."); }
    finally { if (alive.current && generation.current === current) setLoading(false); }
  }, []);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; generation.current++; }; }, [load]);
  const product = catalog?.products.find(item => item.id === productId);
  const pool = catalog?.pools.find(item => item.kind === product?.kind);
  async function pay() {
    if (locked.current || !product || !catalog || !config?.enabled || !config.clientKey || !window.TossPayments || !consents.every(Boolean)) return;
    locked.current = true; setBusy(true); setMessage("");
    pending.current ??= { requestId: crypto.randomUUID(), catalogRevision: catalog.revision, productId: product.id };
    try {
      const order = await paymentsFetch<Order>("orders", { ...pending.current, termsAccepted: true });
      if (!alive.current) return;
      if (order.amount !== product.price || order.quantity !== product.quantity || order.kind !== product.kind || !/^[A-Za-z0-9_-]{6,64}$/.test(order.orderId) || !order.customerKey) {
        setMessage("주문 정보가 변경됐어요. 상점에서 상품을 다시 확인해 주세요."); return;
      }
      if (order.status !== "CREATED") { setMessage("이미 진행한 주문이에요. 구매 내역에서 결제 상태를 확인해 주세요."); return; }
      const currentAccount = await authFetch<AccountSession>("me");
      if (!alive.current) return;
      if (currentAccount.user?.id !== userId) throw new AccountError("로그인 계정이 변경됐어요. 상점에서 다시 시작해 주세요.", 409);
      await window.TossPayments(config.clientKey).payment({ customerKey: order.customerKey }).requestPayment({
        method: "CARD", amount: { currency: "KRW", value: order.amount }, orderId: order.orderId, orderName: order.orderName,
        successUrl: `${window.location.origin}/checkout/success`, failUrl: `${window.location.origin}/checkout/fail`,
        card: { flowMode: "DIRECT", easyPay: "TOSSPAY" },
      });
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof AccountError && error.status < 500) {
        pending.current = null;
        setMessage(error.message);
        if (error.status === 409) { setConsents([false, false, false, false]); await load(); }
      } else if (typeof error === "object" && error && "code" in error && error.code === "USER_CANCEL") {
        setMessage("결제창을 닫았어요. 결제를 원하면 다시 눌러 주세요.");
      } else { setMessage("결제 진행 상태를 확인하지 못했어요. 구매 내역을 확인하거나 같은 주문으로 다시 시도해 주세요."); }
    } finally { if (alive.current) setBusy(false); locked.current = false; }
  }
  if (loading) return <AccountLoading label="주문 정보를 확인하고 있어요." />;
  if (loadError) return <AccountFailure message={loadError} retry={load} />;
  if (!product || !pool) return <div className="account-card"><h1>상품을 찾을 수 없어요</h1><Link href="/shop" className="account-button">상점으로 돌아가기</Link></div>;
  const available = config?.enabled && catalog?.salesEnabled && product.enabled;
  return <div className="checkout-page">
    {available && <Script src="https://js.tosspayments.com/v2/standard" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => { setReady(false); setMessage("토스 결제창을 불러오지 못했어요. 잠시 후 새로고침해 주세요."); }} />}
    <Link href="/shop" className="checkout-back"><ArrowLeft size={15} /> 뽑기 상점</Link>
    <header><span className="account-kicker">A LITTLE TICKET, A NEW FRIEND</span><h1>뽑기권 구매</h1><p>상품과 획득 확률을 확인한 뒤 토스페이로 결제해요.</p></header>
    {config?.mode === "test" && <AccountNotice>테스트 결제입니다. 실제 금액은 청구되지 않아요.</AccountNotice>}
    {!available && <AccountNotice>{config?.enabled ? "이 상품은 판매 준비 중이에요." : config?.message || "결제 서비스를 준비하고 있어요."}</AccountNotice>}
    <section className="checkout-product"><span className="checkout-ticket"><Ticket size={32} /></span><div><h2>{product.name}</h2><p>{product.quantity}매 · 계정에 지급</p></div><strong>{commerceMoney(product.price)}</strong></section>
    <section className="checkout-info"><h2>구매 전에 확인해 주세요</h2><ul><li>결제 승인 후 뽑기권을 지급해요. 상점에서 뽑기권 1매로 한 번 뽑을 수 있어요.</li><li>강아지는 같은 견종·등급도 새로운 가족으로 추가돼요. 최대 100마리까지 함께해요.</li><li>아우라·치장품은 중복으로 나올 수 있어요. 중복 획득은 보유 수량으로 쌓이며 별도 보상으로 바뀌지 않아요.</li><li>새 아우라·치장품은 현재 웹에서 표시돼요. 기존 PC 실행파일에는 별도 앱 업데이트가 필요해요.</li><li>획득 확률은 뽑기 시점에 공개된 설정을 따라요. 변경되면 뽑기 전에 다시 확인할 수 있어요.</li></ul>
      <details><summary>{pool.name} · 전체 획득 확률 보기</summary><div className="checkout-odds">{pool.entries.map(item => <div key={item.id}><span>{item.label} <small>{item.grade}</small></span><b>{probabilityText(item.probability)}</b></div>)}</div></details>
    </section>
    <fieldset className="checkout-consents" disabled={busy}><legend>결제 동의</legend>{terms.map((term, index) => <div key={term.href}><label><input type="checkbox" checked={consents[index]} onChange={event => setConsents(current => current.map((value, i) => i === index ? event.target.checked : value))} />[필수] {term.label} 동의</label><a href={term.href} target="_blank" rel="noopener noreferrer">보기</a></div>)}<div><label><input type="checkbox" checked={consents[3]} onChange={event => setConsents(current => current.map((value, i) => i === 3 ? event.target.checked : value))} />[필수] 상품·가격·획득 확률·중복 획득 안내를 확인했어요.</label></div></fieldset>
    {message && <AccountNotice kind="error">{message}</AccountNotice>}
    <button className="account-button checkout-pay" disabled={!available || !ready || busy || !consents.every(Boolean)} onClick={pay}><SubmitLabel busy={busy}>{busy ? "결제창으로 이동 중…" : `${commerceMoney(product.price)} 토스페이로 결제`}</SubmitLabel></button>
    <p className="checkout-footnote"><ShieldCheck size={15} />결제 정보는 토스페이먼츠에서 처리해요.</p><Link href="/shop#orders" className="checkout-back">내 구매 내역 확인</Link>
  </div>;
}

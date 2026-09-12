"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, CircleX } from "lucide-react";
import { AccountError } from "@/lib/account";
import { paymentsFetch, commerceMoney, paymentStatusLabel, type PaymentOrder } from "@/lib/commerce";
import { AccountNotice, AccountLoading, AccountFailure, SubmitLabel } from "../account/account-ui";
import { useAccountSession } from "../account/use-account-session";

export function PaymentResult({ orderId, paymentKey, amount }: { orderId: string; paymentKey: string; amount: string }) {
  const account = useAccountSession();
  if (account.loading) return <AccountLoading label="결제한 계정을 확인하고 있어요." />;
  if (account.error && !account.unauthorized && !account.forbidden) return <AccountFailure message="계정을 확인하지 못했어요." retry={account.refresh} />;
  if (!account.session?.user) return <div className="checkout-result account-card"><h1>결제한 계정으로 로그인해 주세요</h1><p>로그인한 뒤 이 탭에서 다시 확인해 주세요.</p><a href="/account" target="_blank" rel="noopener noreferrer" className="account-button">새 탭에서 로그인</a><button className="account-button account-button-soft" onClick={account.refresh}>로그인 상태 다시 확인</button></div>;
  return <ConfirmPayment key={`${account.session.user.id}:${orderId}`} {...{ orderId, paymentKey, amount }} />;
}
function ConfirmPayment({ orderId, paymentKey, amount }: { orderId: string; paymentKey: string; amount: string }) {
  const [result, setResult] = useState<{ order: PaymentOrder; message: string } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [needsLogin, setNeedsLogin] = useState(false);
  const started = useRef(false), locked = useRef(false);
  const valid = /^[A-Za-z0-9_-]{6,64}$/.test(orderId) && /^[A-Za-z0-9_-]{1,200}$/.test(paymentKey) && /^\d{1,7}$/.test(amount) && Number(amount) > 0;
  const confirm = useCallback(async () => {
    if (!valid || locked.current) return;
    locked.current = true; setBusy(true); setMessage(""); setNeedsLogin(false);
    try { setResult(await paymentsFetch<{ order: PaymentOrder; message: string }>("confirm", { orderId, paymentKey, amount: Number(amount) })); }
    catch (error) {
      setNeedsLogin(error instanceof AccountError && error.status === 401);
      setMessage(error instanceof AccountError && error.status < 500 ? error.message : "결제 결과를 아직 확인하지 못했어요. 다시 확인하면 같은 주문을 조회해요.");
    } finally { setBusy(false); locked.current = false; }
  }, [valid, orderId, paymentKey, amount]);
  useEffect(() => { if (!started.current) { started.current = true; void confirm(); } }, [confirm]);
  const done = result?.order.status === "DONE" && result.order.ticketsGranted;
  const ended = result && ["CANCELED", "PARTIAL_CANCELED", "ABORTED", "EXPIRED"].includes(result.order.status);
  return <div className="checkout-result account-card"><span className="checkout-result-icon">{done ? <CheckCircle2 size={42} /> : ended || !valid ? <CircleX size={42} /> : <Clock3 size={42} />}</span>
    <h1>{!valid ? "결제 정보를 확인해 주세요" : done ? "뽑기권이 도착했어요" : ended ? paymentStatusLabel(result.order.status) : "결제를 확인하고 있어요"}</h1>
    <p>{!valid ? "결제 정보가 올바르지 않아요. 구매 내역에서 주문 상태를 확인해 주세요." : result?.message || "승인 결과를 확인한 뒤 뽑기권을 지급해요."}</p>
    {result && <dl><div><dt>상품</dt><dd>{result.order.orderName}</dd></div><div><dt>결제 금액</dt><dd>{commerceMoney(result.order.amount)}</dd></div><div><dt>주문 번호</dt><dd>{result.order.orderId}</dd></div></dl>}
    {message && <AccountNotice kind="error">{message}</AccountNotice>}
    {needsLogin && <><p>로그인한 뒤 이 결제 확인 탭으로 돌아와 다시 확인해 주세요.</p><a href="/account" target="_blank" rel="noopener noreferrer" className="account-button">새 탭에서 로그인</a></>}
    {valid && !done && !ended && <button className="account-button" onClick={confirm} disabled={busy}><SubmitLabel busy={busy}>{busy ? "확인 중…" : "결제 결과 다시 확인"}</SubmitLabel></button>}
    <Link href={done ? "/shop" : "/shop#orders"} className={done ? "account-button" : "checkout-back"}>{done ? "상점에서 뽑기" : "구매 내역 보기"}</Link>
  </div>;
}
export function PaymentFailure({ code }: { code: string }) {
  const canceled = ["PAY_PROCESS_CANCELED", "USER_CANCEL"].includes(code);
  return <div className="checkout-result account-card"><CircleX size={42} /><h1>{canceled ? "결제를 취소했어요" : "결제를 완료하지 못했어요"}</h1><p>{canceled ? "결제창을 닫았어요. 구매 내역에서 주문 상태를 확인할 수 있어요." : "결제 과정이 중단됐어요. 금액이 청구됐다면 구매 내역에서 결제 상태를 다시 확인해 주세요."}</p><Link href="/shop#orders" className="account-button">구매 내역 확인</Link><Link href="/shop" className="checkout-back">상점으로 돌아가기</Link></div>;
}

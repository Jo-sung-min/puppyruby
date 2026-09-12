"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, X } from "lucide-react";
import { accountErrorMessage, adminFetch, isAccountAccessError, type MessageResult } from "@/lib/account";
import { AccountNotice, SubmitLabel } from "./account-ui";

export type AdminAction = {
  path: string;
  title: string;
  target: string;
  impact: string;
  confirmLabel: string;
  payload?: Record<string, unknown>;
  destructive: boolean;
};

export function AdminActionDialog({ action, onClose, onComplete, onAccessError }: {
  action: AdminAction;
  onClose: () => void;
  onComplete: (message: string) => void;
  onAccessError: (problem: unknown) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const description = useId();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    const panel = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (panel && !panel.open) panel.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      panel?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function close() { if (!pending.current) onClose(); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !confirmed) return;
    if (!reason.trim()) { setError("처리 사유를 입력해 주세요."); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await adminFetch<MessageResult>(action.path, { ...action.payload, reason: reason.trim() });
      onComplete(result.message);
    } catch (problem) {
      if (isAccountAccessError(problem)) onAccessError(problem);
      else setError(accountErrorMessage(problem));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      className="admin-confirm-dialog account-site" ref={dialog} aria-labelledby={heading} aria-describedby={description}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="admin-confirm-inner">
        <button type="button" className="admin-dialog-close" aria-label="확인 창 닫기" onClick={close} disabled={busy}><X size={20} aria-hidden="true" /></button>
        <span className="account-feature-icon"><AlertTriangle size={24} aria-hidden="true" /></span>
        <h2 id={heading}>{action.title}</h2>
        <p className="admin-action-target">{action.target}</p>
        <p id={description}>{action.impact}</p>
        <form className="account-form" onSubmit={submit}>
          <label className="account-field" htmlFor="admin-action-reason">처리 사유
            <textarea id="admin-action-reason" name="reason" value={reason} onChange={event => setReason(event.target.value)} required maxLength={300} rows={3} placeholder="조치가 필요한 이유를 구체적으로 남겨 주세요." disabled={busy} autoFocus />
            <small>처리 사유는 운영 기록에 남아요.</small>
          </label>
          <label className="admin-confirm-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required /><span>대상과 처리 내용을 확인했어요.</span></label>
          <AccountNotice kind="error">{error}</AccountNotice>
          <div className="admin-confirm-actions">
            <button type="button" className="account-button account-button-soft" onClick={close} disabled={busy}>취소</button>
            <button type="submit" className={`account-button${action.destructive ? " account-button-danger" : ""}`} disabled={busy || !confirmed || !reason.trim()}><SubmitLabel busy={busy}>{action.confirmLabel}</SubmitLabel></button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

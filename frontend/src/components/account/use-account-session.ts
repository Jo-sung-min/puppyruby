"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountError, authFetch, type AccountSession } from "@/lib/account";

export function useAccountSession() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSession(null);
    authFetch<AccountSession>("me", undefined, controller.signal)
      .then(result => { if (!disposed) setSession(result); })
      .catch(problem => {
        if (!disposed) setError(problem instanceof Error ? problem : new Error("계정을 불러오지 못했어요."));
      })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; controller.abort(); };
  }, [revision]);

  useEffect(() => {
    window.addEventListener("puppyruby-auth-changed", refresh);
    return () => window.removeEventListener("puppyruby-auth-changed", refresh);
  }, [refresh]);

  return {
    session, setSession, loading, error, refresh,
    unauthorized: error instanceof AccountError && error.status === 401,
    forbidden: error instanceof AccountError && error.status === 403,
  };
}

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultAppearance, type AppearanceConfig } from "@/lib/dog-styles";
import { parseAppearance } from "@/lib/dog-appearance";

const AppearanceContext = createContext<AppearanceConfig>(defaultAppearance);
const eventName = "puppyruby-appearance-saved";
const revisionKey = "puppyruby-appearance-revision";

/** Call only with the configuration returned by a successful administrator save. */
export function publishAppearance(value: AppearanceConfig) {
  const config = parseAppearance(value);
  window.dispatchEvent(new CustomEvent(eventName, { detail: config }));
  try { localStorage.setItem(revisionKey, `${config.revision}:${Date.now()}`); }
  catch { /* This page updates even when browser storage is unavailable. */ }
}

export function useDogAppearance() { return useContext(AppearanceContext); }

export function DogAppearanceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppearanceConfig>(defaultAppearance);
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function adopt(next: AppearanceConfig) {
      setConfig(previous => next.revision >= previous.revision ? next : previous);
    }
    function schedule() {
      clearTimeout(timer);
      if (!disposed && !document.hidden) timer = setTimeout(() => void refresh(), 30_000);
    }
    async function refresh() {
      clearTimeout(timer);
      if (disposed || document.hidden) return;
      controller?.abort();
      const request = new AbortController(); controller = request;
      const timeout = setTimeout(() => request.abort(), 10_000);
      try {
        const response = await fetch("/api/appearance", { cache: "no-store", credentials: "same-origin", signal: request.signal });
        if (!response.ok) return;
        const next = parseAppearance(await response.json());
        if (!disposed && !request.signal.aborted) adopt(next);
      } catch { /* Keep the last confirmed appearance through a temporary network failure. */ }
      finally {
        clearTimeout(timeout);
        if (controller === request) { controller = null; schedule(); }
      }
    }
    function saved(event: Event) {
      try {
        const next = parseAppearance((event as CustomEvent<unknown>).detail);
        controller?.abort();
        adopt(next); schedule();
      } catch { /* Ignore unrelated or malformed local events. */ }
    }
    function visibility() {
      if (document.hidden) { clearTimeout(timer); controller?.abort(); }
      else void refresh();
    }
    function focused() { void refresh(); }
    function storage(event: StorageEvent) { if (event.key === revisionKey || event.key === null) void refresh(); }
    window.addEventListener(eventName, saved);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", visibility);
    void refresh();
    return () => {
      disposed = true; clearTimeout(timer); controller?.abort();
      window.removeEventListener(eventName, saved);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return <AppearanceContext.Provider value={config}>{children}</AppearanceContext.Provider>;
}

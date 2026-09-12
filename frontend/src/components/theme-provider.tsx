"use client";

import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const preferenceKey = "puppyruby-theme";
const changeEvent = "puppyruby-theme-changed";

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(preferenceKey);
    return value === "light" || value === "dark" ? value : null;
  } catch { return null; }
}
function snapshot(): Theme { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
function serverSnapshot(): Theme { return "light"; }
function subscribe(callback: () => void) {
  window.addEventListener(changeEvent, callback);
  return () => window.removeEventListener(changeEvent, callback);
}
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(changeEvent));
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  function toggleTheme() {
    const next = snapshot() === "dark" ? "light" : "dark";
    try { localStorage.setItem(preferenceKey, next); } catch { /* Still works when storage is unavailable. */ }
    applyTheme(next);
  }
  return { theme, toggleTheme };
}

export function ThemeToggle({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
  return <button type="button" className={`theme-toggle${compact ? " theme-toggle-compact" : ""} ${className}`} onClick={toggleTheme} aria-label={nextLabel} aria-pressed={theme === "dark"} title={nextLabel}>
    {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    {!compact && <span>{theme === "dark" ? "라이트 모드" : "다크 모드"}</span>}
  </button>;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme(storedTheme() ?? (system.matches ? "dark" : "light"));
    const storageChanged = (event: StorageEvent) => { if (event.key === preferenceKey || event.key === null) sync(); };
    sync();
    system.addEventListener("change", sync);
    window.addEventListener("storage", storageChanged);
    return () => { system.removeEventListener("change", sync); window.removeEventListener("storage", storageChanged); };
  }, []);
  return <>
    <div className="night-sky" aria-hidden="true">
      {Array.from({ length: 72 }, (_, index) => <i key={index} className={`night-star${index % 13 === 0 ? " night-star-bright" : ""}`} style={{ left: `${(index * 37 + 11) % 100}%`, top: `${(index * 59 + 7) % 100}%`, "--star-delay": `${-(index % 11)}s`, "--star-duration": `${7 + index % 7}s` } as CSSProperties} />)}
    </div>
    <div className="site-content">{children}</div>
  </>;
}

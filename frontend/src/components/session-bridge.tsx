"use client";

import { useEffect } from "react";

export function SessionBridge() {
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === "puppyruby-auth-revision") window.dispatchEvent(new Event("puppyruby-auth-changed"));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  return null;
}

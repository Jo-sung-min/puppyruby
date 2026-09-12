"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PixelMood } from "./pixel-dog";

type InputReaction = { mood: PixelMood; label: string; at: number };

/** Preview only observes events delivered to this page; it never records key values. */
export function usePuppyInput(stage: RefObject<HTMLDivElement | null>, paused: boolean) {
  const [reaction, setReaction] = useState<InputReaction | null>(null);
  const [look, setLook] = useState(0);
  const [frame, setFrame] = useState(0);
  const keyTimes = useRef<number[]>([]);

  useEffect(() => {
    if (paused) { setReaction(null); setLook(0); return; }
    let lastMove = 0;
    let lastScroll = 0;
    let lastActivity = performance.now();
    let expiry = 0;
    const show = (mood: PixelMood, label: string, duration: number) => {
      lastActivity = performance.now(); expiry = lastActivity + duration;
      setReaction({ mood, label, at: lastActivity });
    };
    const keydown = () => {
      const now = performance.now();
      keyTimes.current = keyTimes.current.filter(time => now - time < 1200).slice(-63);
      keyTimes.current.push(now);
      const fast = keyTimes.current.length >= 8;
      show(fast ? "excited" : "typing", fast ? "우와, 엄청 빠르다! 나도 타다닥!" : "나도 같이 타닥타닥!", 850);
      setFrame(value => 1 - value);
    };
    const pointermove = (event: PointerEvent) => {
      const now = performance.now();
      lastActivity = now;
      if (now - lastMove < 70) return;
      lastMove = now;
      const rect = stage.current?.getBoundingClientRect();
      if (rect) setLook(event.clientX < rect.left + rect.width / 2 - 35 ? -1 : event.clientX > rect.left + rect.width / 2 + 35 ? 1 : 0);
    };
    const pointerdown = (event: PointerEvent) => {
      // Explicit garden controls retain their own feed / play / rest reactions.
      if (event.target instanceof Element && event.target.closest("button,a,input,summary,select")) return;
      show("play", "클릭! 나도 폴짝!", 650);
    };
    const wheel = () => {
      const now = performance.now();
      if (now - lastScroll < 120) return;
      lastScroll = now;
      show("scroll", "데굴데굴~ 같이 스크롤!", 750);
    };
    const clear = () => { keyTimes.current = []; setReaction(null); expiry = 0; lastActivity = performance.now(); };
    const timer = setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();
      if (expiry && now > expiry) { setReaction(null); expiry = 0; }
      if (now - lastActivity > 45000 && !expiry) { setReaction({ mood: "sleep", label: "잠깐 쉬어 갈게… zZ", at: now }); expiry = now + 1000; }
    }, 100);
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointermove", pointermove, { passive: true });
    window.addEventListener("pointerdown", pointerdown, { passive: true });
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      clearInterval(timer); keyTimes.current = [];
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointermove", pointermove);
      window.removeEventListener("pointerdown", pointerdown);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [paused, stage]);
  return { reaction, look, frame };
}

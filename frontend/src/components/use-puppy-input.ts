"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PixelMood } from "./pixel-dog";
import { PuppyClickBurst, puppyBellyDurationMs, puppyBellyLabel } from "../lib/puppy-click-burst";

type InputReaction = { mood: PixelMood; label: string; at: number };

/** Preview only observes events delivered to this page; it never records key values. */
export function usePuppyInput(stage: RefObject<HTMLDivElement | null>, paused: boolean, onBellyStart?: () => void) {
  const [reaction, setReaction] = useState<InputReaction | null>(null);
  const [look, setLook] = useState(0);
  const [lookY, setLookY] = useState(0);
  const [frame, setFrame] = useState(0);
  const keyTimes = useRef<number[]>([]);
  const clickBurst = useRef(new PuppyClickBurst());
  const expiry = useRef(0);
  const bellyStarted = useRef(onBellyStart);
  bellyStarted.current = onBellyStart;
  const cancelReaction = useCallback(() => {
    clickBurst.current.reset(); keyTimes.current = []; expiry.current = 0; setReaction(null);
  }, []);
  const isBellyActive = () => !paused && clickBurst.current.active(performance.now());

  useEffect(() => {
    if (paused) { cancelReaction(); setLook(0); setLookY(0); return; }
    let lastMove = 0;
    let lastScroll = 0;
    const show = (mood: PixelMood, label: string, duration: number) => {
      const at = performance.now();
      if (mood !== "belly" && clickBurst.current.active(at)) return;
      expiry.current = at + duration;
      setReaction({ mood, label, at });
    };
    const keydown = () => {
      const now = performance.now();
      if (clickBurst.current.active(now)) return;
      keyTimes.current = keyTimes.current.filter(time => now - time < 1200).slice(-63);
      keyTimes.current.push(now);
      const fast = keyTimes.current.length >= 8;
      show(fast ? "excited" : "typing", fast ? "우와, 엄청 빠르다! 나도 타다닥!" : "나도 같이 타닥타닥!", 850);
      setFrame(value => 1 - value);
    };
    const pointermove = (event: PointerEvent) => {
      const now = performance.now();
      if (now - lastMove < 70) return;
      lastMove = now;
      const target = stage.current?.querySelector(".room-puppy, .garden-dog") ?? stage.current;
      const rect = target?.getBoundingClientRect();
      if (rect) {
        setLook(event.clientX < rect.left + rect.width / 2 - 35 ? -1 : event.clientX > rect.left + rect.width / 2 + 35 ? 1 : 0);
        setLookY(event.clientY < rect.top + rect.height * .4 - 30 ? -1 : event.clientY > rect.top + rect.height * .4 + 30 ? 1 : 0);
      }
    };
    const pointerdown = (event: PointerEvent) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      // Pet buttons count toward the burst; care, links and form controls retain their actions.
      if (event.target instanceof Element && !event.target.closest(".room-puppy, .garden-dog")
        && event.target.closest("button,a,input,textarea,[contenteditable],summary,select")) return;
      const now = performance.now();
      if (clickBurst.current.active(now)) return;
      if (clickBurst.current.register(now)) {
        // Clear a previous pet pose in the same event, before the fifth button click can run.
        bellyStarted.current?.();
        show("belly", puppyBellyLabel, puppyBellyDurationMs);
        return;
      }
      show("play", "클릭! 나도 폴짝!", 650);
    };
    const wheel = () => {
      const now = performance.now();
      if (clickBurst.current.active(now)) return;
      if (now - lastScroll < 120) return;
      lastScroll = now;
      show("scroll", "데굴데굴~ 같이 스크롤!", 750);
    };
    const clear = () => { cancelReaction(); setLook(0); setLookY(0); };
    const timer = setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();
      if (expiry.current && now >= expiry.current) { setReaction(null); expiry.current = 0; }
    }, 100);
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointermove", pointermove, { passive: true });
    window.addEventListener("pointerdown", pointerdown, { passive: true });
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("blur", clear);
    window.addEventListener("dragstart", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      clearInterval(timer); keyTimes.current = []; clickBurst.current.reset(); expiry.current = 0;
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointermove", pointermove);
      window.removeEventListener("pointerdown", pointerdown);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", clear);
      window.removeEventListener("dragstart", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [paused, stage, cancelReaction]);
  return { reaction, look, lookY, frame, isBellyActive, cancelReaction };
}

export const puppyBellyClickWindowMs = 1200;
export const puppyBellyDurationMs = 2400;
export const puppyBellyLabel = "발라당! 배도 쓰다듬어 줘 ♡";

/** Stores event times only. A completed burst cannot extend the fixed belly animation. */
export class PuppyClickBurst {
  private clicks: number[] = [];
  private until = 0;
  private lastNow = Number.NEGATIVE_INFINITY;

  active(now: number) {
    if (!Number.isFinite(now)) return false;
    if (now < this.lastNow) this.reset();
    this.lastNow = now;
    return now >= 0 && now < this.until;
  }

  register(now: number) {
    if (!Number.isFinite(now) || this.active(now)) return false;
    this.clicks = this.clicks.filter(at => now >= at && now - at <= puppyBellyClickWindowMs).slice(-4);
    this.clicks.push(now);
    if (this.clicks.length < 5) return false;
    this.clicks = [];
    this.until = now + puppyBellyDurationMs;
    return true;
  }

  reset() { this.clicks = []; this.until = 0; this.lastNow = Number.NEGATIVE_INFINITY; }
}

/**
 * Pass detection for one pair of drivers. Pure and deterministic so it can be unit-tested.
 * A pass is counted when two drivers come within `radiusM`, once per approach: they must
 * separate beyond `radiusM * 2.5` before another pass can count, and repeat passes also
 * need `gapMs` since the last counted one.
 */
export interface PairState {
  near: boolean;
  passes: number;
  lastPassAt: number; // epoch ms, 0 = never
  buddy: boolean;
  passesToday: number;
  day: number;
}

export const emptyPair = (): PairState => ({ near: false, passes: 0, lastPassAt: 0, buddy: false, passesToday: 0, day: -1 });

export interface PassConfig { radiusM: number; gapMs: number; maxPerDay: number }

export type PassEvent = { kind: 'first' } | { kind: 'repeat'; count: number } | null;

export function stepPair(state: PairState, distanceM: number, now: number, day: number, cfg: PassConfig): { state: PairState; event: PassEvent } {
  const s = { ...state };
  if (s.day !== day) { s.day = day; s.passesToday = 0; }
  let event: PassEvent = null;
  if (distanceM < cfg.radiusM && !s.near) {
    s.near = true;
    const gapOk = s.passes === 0 || now - s.lastPassAt >= cfg.gapMs;
    if (gapOk && s.passesToday < cfg.maxPerDay) {
      s.passes += 1;
      s.passesToday += 1;
      s.lastPassAt = now;
      event = s.passes === 1 ? { kind: 'first' } : { kind: 'repeat', count: s.passes };
    }
  } else if (distanceM > cfg.radiusM * 2.5) {
    s.near = false;
  }
  return { state: s, event };
}

/** Stable key for an unordered pair of user ids. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

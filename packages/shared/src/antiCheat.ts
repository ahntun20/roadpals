import { distanceM, type LatLng } from './geo';

export interface Fix extends LatLng {
  /** epoch ms from the device */
  ts: number;
  /** m/s, from GPS (may be missing) */
  speed?: number | null;
  heading?: number | null;
  /** horizontal accuracy in metres */
  accuracy?: number | null;
  /** Android reports mock-location apps */
  mocked?: boolean;
}

export type FixVerdict =
  | { ok: true; deltaM: number; dtS: number; speedMps: number }
  | { ok: false; reason: 'mocked' | 'inaccurate' | 'out_of_order' | 'impossible_speed' | 'future' };

export const LIMITS = {
  maxSpeedMps: 70, // 252 km/h
  maxAccuracyM: 50,
  jitterM: 3,
  maxGapS: 120, // after a longer gap, don't credit distance (could be a teleport or a train)
  maxFutureMs: 60_000,
};

/**
 * Check a new fix against the previous accepted fix. Rejected fixes earn nothing and,
 * for "mocked" / "impossible_speed", are counted toward a cheat score on the server.
 */
export function checkFix(prev: Fix | null, next: Fix, now = Date.now()): FixVerdict {
  if (next.mocked) return { ok: false, reason: 'mocked' };
  if (next.accuracy != null && next.accuracy > LIMITS.maxAccuracyM) return { ok: false, reason: 'inaccurate' };
  if (next.ts > now + LIMITS.maxFutureMs) return { ok: false, reason: 'future' };
  if (!prev) return { ok: true, deltaM: 0, dtS: 0, speedMps: next.speed ?? 0 };
  const dtS = (next.ts - prev.ts) / 1000;
  if (dtS <= 0) return { ok: false, reason: 'out_of_order' };
  const d = distanceM(prev, next);
  const implied = d / dtS;
  if (implied > LIMITS.maxSpeedMps && d > 100) return { ok: false, reason: 'impossible_speed' };
  const credited = dtS > LIMITS.maxGapS || d < LIMITS.jitterM ? 0 : d;
  return { ok: true, deltaM: credited, dtS, speedMps: next.speed ?? implied };
}

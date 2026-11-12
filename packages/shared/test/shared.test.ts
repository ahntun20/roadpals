import { describe, expect, it } from 'vitest';
import {
  checkFix, defaultRules, distanceM, emptyPair, geohash, isRushOrNight, levelFor, localDayIndex,
  mergeRules, offset, stepPair, weekId, weeklyPrizeShare, brandColor, SHOP_ITEMS, RULE_IDS,
} from '../src';

describe('rules', () => {
  it('has 22 rules with unique ids', () => {
    expect(RULE_IDS.length).toBe(22);
    expect(new Set(RULE_IDS).size).toBe(22);
  });
  it('merges stored values and clamps params', () => {
    const r = mergeRules({ km: { points: 5 }, newface: { param: { value: 9999 } as never }, waveSent: { enabled: false } });
    expect(r.km.points).toBe(5);
    expect(r.newface.param!.value).toBe(300);
    expect(r.waveSent.enabled).toBe(false);
    expect(defaultRules().km.points).toBe(2);
  });
});

describe('levels', () => {
  it('uses lifetime thresholds', () => {
    expect(levelFor(0).level.name).toBe('Rookie');
    expect(levelFor(150).level.name).toBe('Cruiser');
    expect(levelFor(5000).next).toBeNull();
  });
  it('pays weekly prizes by rank', () => {
    expect([0, 1, 2, 5, 10].map(weeklyPrizeShare)).toEqual([1, 0.6, 0.3, 0.1, 0]);
  });
});

describe('geo', () => {
  it('measures and offsets distances', () => {
    const a = { lat: 40.7128, lng: -74.006 };
    const b = offset(a, 1000, 90);
    expect(distanceM(a, b)).toBeGreaterThan(999);
    expect(distanceM(a, b)).toBeLessThan(1001);
  });
  it('geohashes', () => {
    expect(geohash({ lat: 57.64911, lng: 10.40744 }, 11)).toBe('u4pruydqqvj');
  });
});

describe('time', () => {
  it('computes local day and week', () => {
    const d = new Date('2026-11-12T03:00:00Z');
    expect(localDayIndex(d, 'America/New_York')).toBe(localDayIndex(new Date('2026-11-11T12:00:00Z'), 'UTC'));
    expect(weekId(new Date('2026-11-12T12:00:00Z'))).toBe('2026-W46');
    expect(weekId(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(isRushOrNight(8)).toBe(true);
    expect(isRushOrNight(12)).toBe(false);
  });
});

describe('encounters', () => {
  const cfg = { radiusM: 60, gapMs: 120_000, maxPerDay: 6 };
  it('counts one pass per approach and respects the gap', () => {
    let s = emptyPair();
    let r = stepPair(s, 50, 0, 1, cfg); s = r.state;
    expect(r.event).toEqual({ kind: 'first' });
    r = stepPair(s, 40, 1000, 1, cfg); s = r.state;
    expect(r.event).toBeNull(); // still near
    r = stepPair(s, 200, 2000, 1, cfg); s = r.state; // separated
    r = stepPair(s, 30, 60_000, 1, cfg); s = r.state;
    expect(r.event).toBeNull(); // within the 2 min gap
    r = stepPair(s, 400, 70_000, 1, cfg); s = r.state;
    r = stepPair(s, 30, 200_000, 1, cfg); s = r.state;
    expect(r.event).toEqual({ kind: 'repeat', count: 2 });
  });
  it('caps passes per pair per day', () => {
    let s = emptyPair();
    let count = 0;
    for (let i = 0; i < 20; i++) {
      const a = stepPair(s, 10, i * 1e6, 3, cfg); s = a.state; if (a.event) count++;
      s = stepPair(s, 500, i * 1e6 + 1, 3, cfg).state;
    }
    expect(count).toBe(6);
  });
});

describe('anti-cheat', () => {
  const base = { lat: 40, lng: -74, ts: 1_000_000 };
  it('rejects mocked and teleporting fixes', () => {
    expect(checkFix(null, { ...base, mocked: true }, 1_000_000).ok).toBe(false);
    const far = { ...offset(base, 5000, 0), ts: base.ts + 10_000 };
    expect(checkFix(base, far, base.ts + 10_000)).toEqual({ ok: false, reason: 'impossible_speed' });
  });
  it('credits normal driving and ignores jitter', () => {
    const next = { ...offset(base, 140, 0), ts: base.ts + 10_000 };
    const v = checkFix(base, next, next.ts);
    expect(v.ok && Math.round(v.deltaM)).toBe(140);
    const jit = { ...offset(base, 1, 0), ts: base.ts + 1000 };
    const j = checkFix(base, jit, jit.ts);
    expect(j.ok && j.deltaM).toBe(0);
  });
});

describe('catalog', () => {
  it('gives every brand a colour and unique shop ids', () => {
    expect(brandColor('car', 'Toyota')).toBe('#dc2626');
    expect(brandColor('car', 'Unknown')).toBe('#94a3b8');
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
  });
});

import { randomBytes, randomInt } from 'node:crypto';

/** Serialises async work per key (e.g. one user's GPS fixes) inside this process. */
export class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => {});
    this.tails.set(key, tail);
    tail.then(() => { if (this.tails.get(key) === tail) this.tails.delete(key); });
    return next;
  }
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function code(len = 6): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[randomInt(ALPHA.length)];
  return s;
}

export function otp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function token(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

/** Rough bounding box in degrees around a point, for indexed lat/lng range queries. */
export function bbox(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Order two numeric user ids for the encounters table (user_a < user_b numerically, not as text). */
export function orderIds(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

import { emptyPair, pairKey, type Fix, type PairState, type VehicleType } from '@roadpals/shared';
import type { Ctx } from '../ctx';
import { config } from '../config';
import { orderIds } from '../util';

/** Live state in Redis: current positions (geo index), last fix per user, pair states, profile cache. */
const GEO = 'live:pos';
const SEEN = 'live:seen';
const metaKey = (uid: string) => `live:fix:${uid}`;
const pairRedisKey = (k: string) => `pair:${k}`;
const profKey = (uid: string) => `prof:${uid}`;

export interface LiveFix extends Fix { heading: number }

export async function setPosition(ctx: Ctx, uid: string, fix: LiveFix): Promise<void> {
  await ctx.redis
    .multi()
    .geoadd(GEO, fix.lng, fix.lat, uid)
    .zadd(SEEN, ctx.now(), uid)
    .set(metaKey(uid), JSON.stringify(fix), 'EX', 3600)
    .exec();
}

export async function lastFix(ctx: Ctx, uid: string): Promise<LiveFix | null> {
  const v = await ctx.redis.get(metaKey(uid));
  return v ? (JSON.parse(v) as LiveFix) : null;
}

export async function removePosition(ctx: Ctx, uid: string): Promise<void> {
  await ctx.redis.multi().zrem(GEO, uid).zrem(SEEN, uid).exec();
}

/** Users seen in the last POSITION_TTL_S seconds within radius, nearest first. */
export async function nearby(ctx: Ctx, lat: number, lng: number, radiusM: number, count = 50): Promise<{ id: string; distM: number }[]> {
  const res = (await ctx.redis.call('GEOSEARCH', GEO, 'FROMLONLAT', String(lng), String(lat), 'BYRADIUS', String(radiusM), 'm', 'ASC', 'COUNT', String(count + 1), 'WITHDIST')) as [string, string][];
  if (!res.length) return [];
  const ids = res.map((r) => r[0]);
  const seen = await ctx.redis.zmscore(SEEN, ...ids);
  const cutoff = ctx.now() - config.positionTtlS * 1000;
  return res
    .map((r, i) => ({ id: r[0], distM: Number(r[1]), seen: Number(seen[i] ?? 0) }))
    .filter((r) => r.seen >= cutoff)
    .map(({ id, distM }) => ({ id, distM }));
}

/** Drop drivers who stopped sending positions (app closed, parked). */
export async function pruneStale(ctx: Ctx): Promise<number> {
  const cutoff = ctx.now() - config.positionTtlS * 1000;
  const stale = await ctx.redis.zrangebyscore(SEEN, 0, cutoff);
  if (stale.length) await ctx.redis.multi().zrem(GEO, ...stale).zrem(SEEN, ...stale).exec();
  return stale.length;
}

export interface Pair extends PairState { convoyM: number; convoyDay: number }

export async function getPair(ctx: Ctx, a: string, b: string): Promise<Pair> {
  const k = pairKey(a, b);
  const v = await ctx.redis.get(pairRedisKey(k));
  if (v) return JSON.parse(v) as Pair;
  // Cache miss (new pair or Redis restarted): restore the pass count from Postgres.
  const [lo, hi] = orderIds(a, b);
  const r = await ctx.db.query('SELECT passes, last_at FROM encounters WHERE user_a=$1 AND user_b=$2', [lo, hi]);
  const p: Pair = { ...emptyPair(), convoyM: 0, convoyDay: -1 };
  if (r.rowCount) {
    p.passes = r.rows[0].passes;
    p.lastPassAt = new Date(r.rows[0].last_at).getTime();
    p.buddy = p.passes >= 2 && p.passes >= (ctx.rules().buddy.param?.value ?? 5);
  }
  return p;
}

export async function savePair(ctx: Ctx, a: string, b: string, p: Pair): Promise<void> {
  await ctx.redis.set(pairRedisKey(pairKey(a, b)), JSON.stringify(p), 'EX', 7 * 86400);
}

export async function pairPasses(ctx: Ctx, me: string, others: string[]): Promise<number[]> {
  if (!others.length) return [];
  const vals = await ctx.redis.mget(...others.map((o) => pairRedisKey(pairKey(me, o))));
  return vals.map((v) => (v ? (JSON.parse(v) as Pair).passes : 0));
}

export interface Profile {
  id: string;
  name: string;
  vehicleType: VehicleType;
  brand: string;
  color: string;
  skin: string;
  wave: string;
}

export async function cacheProfile(ctx: Ctx, p: Profile): Promise<void> {
  await ctx.redis.set(profKey(p.id), JSON.stringify(p), 'EX', 7 * 86400);
}

export async function getProfiles(ctx: Ctx, ids: string[]): Promise<(Profile | null)[]> {
  if (!ids.length) return [];
  const vals = await ctx.redis.mget(...ids.map(profKey));
  return vals.map((v) => (v ? (JSON.parse(v) as Profile) : null));
}

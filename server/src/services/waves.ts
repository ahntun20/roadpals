import { localDayIndex, param } from '@roadpals/shared';
import type { Ctx } from '../ctx';
import { config } from '../config';
import { award } from './ledger';
import { lastFix, nearby } from './live';
import { dailyKey, firstOfDay } from './location';
import { getUser, profiles } from './users';

const pendingKey = (uid: string) => `wavefrom:${uid}`;
const wavedByKey = (uid: string, day: number) => `wavedby:${uid}:${day}`;

export type WaveResult =
  | { ok: true; to: string; mutual: boolean }
  | { ok: false; reason: 'locked_while_driving' | 'nobody_nearby' | 'no_position' | 'no_user' };

/**
 * A wave goes to whoever just waved at you (that makes it mutual), otherwise to the nearest
 * driver within range. For safety, drivers can't wave while moving unless passenger mode is on.
 */
export async function wave(ctx: Ctx, uid: string): Promise<WaveResult> {
  const me = await getUser(ctx, uid);
  if (!me) return { ok: false, reason: 'no_user' };
  const fix = await lastFix(ctx, uid);
  if (!fix || ctx.now() - fix.ts > config.positionTtlS * 1000) return { ok: false, reason: 'no_position' };
  if (!me.passenger_mode && (fix.speed ?? 0) > config.waveLockSpeedMps) return { ok: false, reason: 'locked_while_driving' };

  const now = new Date(ctx.now());
  let target: string | null = null;
  let mutual = false;
  const pending = await ctx.redis.get(pendingKey(uid));
  if (pending) {
    target = pending;
    mutual = true;
    await ctx.redis.del(pendingKey(uid));
  } else {
    const near = (await nearby(ctx, fix.lat, fix.lng, config.waveRangeM, 5)).filter((o) => o.id !== uid);
    target = near[0]?.id ?? null;
  }
  if (!target) return { ok: false, reason: 'nobody_nearby' };

  const profs = await profiles(ctx, [uid, target]);
  const mine = profs.get(uid)!;
  const theirs = profs.get(target);
  const targetName = theirs?.name ?? 'a driver';

  // Sender: paid up to the daily cap (+ any "+10 waves" boosts), and the first wave of the day.
  const day = localDayIndex(now, me.tz);
  const dk = dailyKey(uid, day);
  const sent = await ctx.redis.hincrby(dk, 'waves', 1);
  const extra = Number((await ctx.redis.hget(dk, 'extraWaves')) ?? 0);
  await ctx.redis.expire(dk, 3 * 86400);
  await firstOfDay(ctx, uid, me.tz, 'firstWave', 'First wave of the day', now);
  if (sent <= param(ctx.rules(), 'waveSent') + extra) await award(ctx, uid, 'waveSent', `You waved at ${targetName}`);
  else ctx.send(uid, { t: 'toast', icon: '🙋', text: `Waved at ${targetName} (daily cap reached)` });

  // Receiver: sees the wave and can wave back within the window. Paid once per sender per day.
  const other = await getUser(ctx, target);
  const theirDay = localDayIndex(now, other?.tz ?? 'UTC');
  if (await ctx.redis.sadd(wavedByKey(target, theirDay), uid)) {
    await ctx.redis.expire(wavedByKey(target, theirDay), 2 * 86400);
    await award(ctx, target, 'wavedAt', `${mine.name} waved at you`);
  }
  if (!mutual) await ctx.redis.set(pendingKey(target), uid, 'PX', config.waveBackWindowMs);
  ctx.send(target, { t: 'waved', from: { id: uid, name: mine.name, emoji: mine.wave }, canWaveBackUntil: mutual ? 0 : ctx.now() + config.waveBackWindowMs });

  if (mutual) {
    await award(ctx, uid, 'mutual', `Mutual wave with ${targetName}`);
    await award(ctx, target, 'mutual', `${mine.name} waved back`);
  }
  return { ok: true, to: target, mutual };
}

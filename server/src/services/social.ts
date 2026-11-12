import { param, weekId, weeklyPrizeShare } from '@roadpals/shared';
import type { Ctx } from '../ctx';
import { config } from '../config';
import { code } from '../util';
import { award, keys } from './ledger';
import { pruneStale } from './live';
import { profiles } from './users';

export class SocialError extends Error {}

// ---------- teams ----------
export async function createTeam(ctx: Ctx, uid: string, name: string) {
  const clean = name.trim().slice(0, 40);
  if (clean.length < 2) throw new SocialError('Team name is too short');
  for (let i = 0; i < 5; i++) {
    const c = code(6);
    const r = await ctx.db.query('INSERT INTO teams(name,code) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING RETURNING id, name, code', [clean, c]);
    if (r.rowCount) {
      await ctx.db.query('UPDATE users SET team_id=$2 WHERE id=$1', [uid, r.rows[0].id]);
      return { id: String(r.rows[0].id), name: r.rows[0].name, code: r.rows[0].code };
    }
  }
  throw new SocialError('Could not create team, try again');
}

export async function joinTeam(ctx: Ctx, uid: string, teamCode: string) {
  const t = await ctx.db.query('SELECT id, name, code FROM teams WHERE code=$1', [teamCode.trim().toUpperCase()]);
  if (!t.rowCount) throw new SocialError('No team with that code');
  const count = await ctx.db.query('SELECT count(*)::int AS n FROM users WHERE team_id=$1', [t.rows[0].id]);
  if (count.rows[0].n >= 20) throw new SocialError('That team is full (20 drivers)');
  await ctx.db.query('UPDATE users SET team_id=$2 WHERE id=$1', [uid, t.rows[0].id]);
  return { id: String(t.rows[0].id), name: t.rows[0].name, code: t.rows[0].code };
}

export async function leaveTeam(ctx: Ctx, uid: string) {
  await ctx.db.query('UPDATE users SET team_id=NULL WHERE id=$1', [uid]);
}

export async function myTeam(ctx: Ctx, uid: string) {
  const u = await ctx.db.query('SELECT team_id FROM users WHERE id=$1', [uid]);
  const teamId = u.rows[0]?.team_id;
  if (!teamId) return null;
  const wk = weekId(new Date(ctx.now()));
  const [t, members, week] = await Promise.all([
    ctx.db.query('SELECT id, name, code FROM teams WHERE id=$1', [teamId]),
    ctx.db.query('SELECT id, name, vehicle_type, vehicle_brand FROM users WHERE team_id=$1 ORDER BY name', [teamId]),
    ctx.db.query('SELECT km, rewarded FROM team_weeks WHERE team_id=$1 AND week=$2', [teamId, wk]),
  ]);
  return {
    id: String(t.rows[0].id), name: t.rows[0].name, code: t.rows[0].code,
    week: wk, km: Math.round((week.rows[0]?.km ?? 0) * 10) / 10, goalKm: param(ctx.rules(), 'team'), rewarded: !!week.rows[0]?.rewarded,
    members: members.rows.map((m) => ({ id: String(m.id), name: m.name, vehicleType: m.vehicle_type, brand: m.vehicle_brand })),
  };
}

// ---------- leaderboard ----------
export async function leaderboard(ctx: Ctx, uid: string, limit = 20) {
  const wk = weekId(new Date(ctx.now()));
  const key = keys.leaderboard(wk);
  const top = await ctx.redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < top.length; i += 2) { ids.push(top[i]); scores.push(Number(top[i + 1])); }
  const [rank, myScore] = await Promise.all([ctx.redis.zrevrank(key, uid), ctx.redis.zscore(key, uid)]);
  const profs = await profiles(ctx, ids);
  const weekly = ctx.rules().weekly;
  return {
    week: wk,
    entries: ids.map((id, i) => ({
      rank: i + 1, id, score: scores[i], name: profs.get(id)?.name ?? 'Driver', vehicleType: profs.get(id)?.vehicleType ?? 'car', brand: profs.get(id)?.brand ?? '',
      prize: weekly.enabled ? Math.round(weekly.points * weeklyPrizeShare(i)) : 0,
    })),
    me: { rank: rank == null ? null : rank + 1, score: Number(myScore ?? 0) },
  };
}

// ---------- background jobs ----------
/** Pays last week's leaderboard prizes exactly once (guarded by the weekly_payouts table). */
export async function payWeeklyPrizes(ctx: Ctx): Promise<number> {
  const prev = weekId(new Date(ctx.now() - 7 * 86400_000));
  const claim = await ctx.db.query('INSERT INTO weekly_payouts(week) VALUES ($1) ON CONFLICT DO NOTHING RETURNING week', [prev]);
  if (!claim.rowCount) return 0;
  const top = await ctx.redis.zrevrange(keys.leaderboard(prev), 0, 9, 'WITHSCORES');
  let paid = 0;
  for (let i = 0; i < top.length; i += 2) {
    const rank = i / 2;
    const share = weeklyPrizeShare(rank);
    if (share > 0 && Number(top[i + 1]) > 0) {
      await award(ctx, top[i], 'weekly', `Finished #${rank + 1} on the weekly leaderboard (${prev})`, { mult: share, skipLeaderboard: true, meta: { week: prev } });
      paid++;
    }
  }
  return paid;
}

/** Rolling expiry: points expire only after POINTS_EXPIRY_DAYS without driving. */
export async function expirePoints(ctx: Ctx): Promise<number> {
  const r = await ctx.db.query(
    `WITH stale AS (
       SELECT id, balance FROM users
       WHERE balance > 0 AND last_drive_at IS NOT NULL AND last_drive_at < now() - ($1 || ' days')::interval
       FOR UPDATE SKIP LOCKED LIMIT 500),
     l AS (INSERT INTO points_ledger(user_id,kind,amount,text,meta) SELECT id,'expire',-balance,'Points expired after a year without driving','{"icon":"⌛"}' FROM stale)
     UPDATE users u SET balance=0 FROM stale WHERE u.id=stale.id RETURNING u.id`,
    [String(config.pointsExpiryDays)],
  );
  return r.rowCount ?? 0;
}

export function startJobs(ctx: Ctx, log: (msg: string) => void): () => void {
  const run = async () => {
    try {
      await pruneStale(ctx);
      const paid = await payWeeklyPrizes(ctx);
      if (paid) log(`weekly prizes paid to ${paid} drivers`);
      const expired = await expirePoints(ctx);
      if (expired) log(`expired points for ${expired} inactive users`);
    } catch (e) {
      log(`job error: ${(e as Error).message}`);
    }
  };
  const t = setInterval(run, config.jobIntervalMs);
  void run();
  return () => clearInterval(t);
}

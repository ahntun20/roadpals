import {
  checkFix, distanceM, geohash, HAZARDS, isRushOrNight, localDayIndex, localHour, param, stepPair, weekId,
  type Fix, type HazardType, type PublicDriver,
} from '@roadpals/shared';
import type { Ctx } from '../ctx';
import { config } from '../config';
import { bbox, KeyedMutex, orderIds } from '../util';
import { award, keys } from './ledger';
import { distanceToSegmentM, pairKey } from '@roadpals/shared';
import { getPair, lastFix, nearby, pairPasses, savePair, setPosition } from './live';
import { getUser, profiles, type UserRow } from './users';

const mutex = new KeyedMutex();
const pairMutex = new KeyedMutex();
const dayKey = (uid: string, day: number) => `day:${uid}:${day}`;
const exploredKey = (uid: string) => `explored:${uid}`;
const promptedKey = (uid: string) => `prompted:${uid}`;

/** Optional speed-limit lookup (e.g. from OSM maxspeed via your map-matching service). null = unknown. */
export type SpeedLimitProvider = (lat: number, lng: number) => Promise<number | null>;
let speedLimit: SpeedLimitProvider = async () => null;
export function setSpeedLimitProvider(p: SpeedLimitProvider) { speedLimit = p; }

export interface FixResult { accepted: boolean; reason?: string; deltaM?: number }

/** Process one GPS fix for a user. Fixes for the same user run one at a time, in order. */
export function processFix(ctx: Ctx, uid: string, fix: Fix): Promise<FixResult> {
  return mutex.run(uid, () => processFixInner(ctx, uid, fix));
}

async function processFixInner(ctx: Ctx, uid: string, fix: Fix): Promise<FixResult> {
  const prev = await lastFix(ctx, uid);
  const verdict = checkFix(prev, fix, ctx.now());
  if (!verdict.ok) {
    if (verdict.reason === 'mocked' || verdict.reason === 'impossible_speed') {
      await ctx.db.query('UPDATE users SET cheat_score=cheat_score+1 WHERE id=$1', [uid]);
    }
    ctx.send(uid, { t: 'fixRejected', reason: verdict.reason });
    return { accepted: false, reason: verdict.reason };
  }
  const heading = fix.heading != null && fix.heading >= 0 ? fix.heading : prev && verdict.deltaM > 0 ? headingBetween(prev, fix) : prev?.heading ?? 0;
  await setPosition(ctx, uid, { ...fix, heading });

  const user = await getUser(ctx, uid);
  if (!user) return { accepted: false, reason: 'no_user' };
  const now = new Date(ctx.now());
  const day = localDayIndex(now, user.tz);
  const rules = ctx.rules();
  const delta = verdict.deltaM;

  // Speeding: kilometres over the limit earn nothing, and they spoil the safe-trip bonus.
  const limitKmh = delta > 0 ? await speedLimit(fix.lat, fix.lng) : null;
  const speeding = limitKmh != null && verdict.speedMps * 3.6 > limitKmh * 1.05 + 3;

  if (delta > 0) await creditDistance(ctx, user, delta, speeding, day, now);
  if (delta > 0 || verdict.speedMps > 2) await explore(ctx, user, fix);
  if (user.active_trip) await checkTrip(ctx, user, fix, speeding);
  await checkins(ctx, user, fix, day);
  await hazardPrompt(ctx, user, fix);
  await encounters(ctx, user, fix, prev, delta, now);
  await pushNearby(ctx, uid, fix);
  return { accepted: true, deltaM: delta };
}

function headingBetween(a: Fix, b: Fix): number {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x = Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) - Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function creditDistance(ctx: Ctx, user: UserRow, delta: number, speeding: boolean, day: number, now: Date) {
  const uid = String(user.id);
  const up = await ctx.db.query(
    'UPDATE users SET odo_m=odo_m+$2, legal_m=legal_m+$3, last_drive_at=now() WHERE id=$1 RETURNING legal_m, km_awarded, odo_m',
    [uid, delta, speeding ? 0 : delta],
  );
  const { legal_m, odo_m } = up.rows[0];
  let kmAwarded: number = up.rows[0].km_awarded;
  user.odo_m = odo_m;
  const target = Math.floor(legal_m / 1000);
  while (kmAwarded < target) {
    kmAwarded++;
    await award(ctx, uid, 'km', `Drove ${kmAwarded} km`);
    if (isRushOrNight(localHour(now, user.tz))) {
      const h = localHour(now, user.tz);
      await award(ctx, uid, 'rush', h >= 22 || h < 5 ? 'Night-driving bonus' : 'Rush-hour bonus');
    }
  }
  if (kmAwarded !== up.rows[0].km_awarded) await ctx.db.query('UPDATE users SET km_awarded=$2 WHERE id=$1', [uid, kmAwarded]);

  // Invites: the inviter is paid once their friend drives a first real kilometre.
  if (kmAwarded >= 1 && user.invited_by && !user.invite_rewarded) {
    const r = await ctx.db.query('UPDATE users SET invite_rewarded=true WHERE id=$1 AND NOT invite_rewarded RETURNING id', [uid]);
    if (r.rowCount) await award(ctx, String(user.invited_by), 'invite', `${user.name} (your invite) drove their first km`);
  }

  // Daily distance → streak.
  const dk = dayKey(uid, day);
  const before = Number((await ctx.redis.hget(dk, 'dist')) ?? 0);
  const after = Number(await ctx.redis.hincrbyfloat(dk, 'dist', delta));
  await ctx.redis.expire(dk, 3 * 86400);
  if (before < 1000 && after >= 1000 && user.streak_day !== day) {
    let streak = 1;
    let freezes = user.freezes;
    if (user.streak_day === day - 1) streak = user.streak + 1;
    else if (freezes > 0 && user.streak > 0 && user.streak_day >= day - 2) { freezes--; streak = user.streak + 1; ctx.send(uid, { t: 'toast', icon: '🧊', text: 'Streak freeze used — streak saved' }); }
    await ctx.db.query('UPDATE users SET streak=$2, streak_day=$3, freezes=$4 WHERE id=$1', [uid, streak, day, freezes]);
    await award(ctx, uid, 'streak', `${streak}-day driving streak`, { mult: Math.min(streak, param(ctx.rules(), 'streak')) });
  }

  // Team weekly km.
  if (user.team_id) {
    const wk = weekId(now);
    const t = await ctx.db.query(
      `INSERT INTO team_weeks(team_id,week,km) VALUES ($1,$2,$3)
       ON CONFLICT (team_id,week) DO UPDATE SET km=team_weeks.km+EXCLUDED.km RETURNING km, rewarded`,
      [user.team_id, wk, delta / 1000],
    );
    const goal = param(ctx.rules(), 'team');
    if (!t.rows[0].rewarded && t.rows[0].km >= goal) {
      const claim = await ctx.db.query('UPDATE team_weeks SET rewarded=true WHERE team_id=$1 AND week=$2 AND NOT rewarded RETURNING team_id', [user.team_id, wk]);
      if (claim.rowCount) {
        const members = await ctx.db.query('SELECT id FROM users WHERE team_id=$1', [user.team_id]);
        for (const m of members.rows) await award(ctx, String(m.id), 'team', `Your team hit ${goal} km this week!`);
      }
    }
  }
}

async function explore(ctx: Ctx, user: UserRow, fix: Fix) {
  const uid = String(user.id);
  const cell = geohash(fix, 7);
  if (await ctx.redis.sadd(exploredKey(uid), cell)) {
    await ctx.db.query('UPDATE users SET explored_cells=explored_cells+1 WHERE id=$1', [uid]);
    await award(ctx, uid, 'explore', 'Explored a new area', { quiet: true, meta: { cell } });
  }
}

async function checkTrip(ctx: Ctx, user: UserRow, fix: Fix, speeding: boolean) {
  const uid = String(user.id);
  const trip = user.active_trip!;
  if (speeding && !trip.speeding) {
    trip.speeding = true;
    await ctx.db.query('UPDATE users SET active_trip=$2 WHERE id=$1', [uid, JSON.stringify(trip)]);
  }
  if (distanceM(fix, trip) > config.tripArriveRadiusM) return;
  const cleared = await ctx.db.query('UPDATE users SET active_trip=NULL WHERE id=$1 AND active_trip IS NOT NULL RETURNING id', [uid]);
  if (!cleared.rowCount) return;
  if (user.odo_m - trip.startOdoM > 500) {
    await award(ctx, uid, 'trip', 'Arrived at your destination');
    if (!trip.speeding) await award(ctx, uid, 'safe', 'Safe trip — no speeding');
    else ctx.send(uid, { t: 'toast', icon: '🚨', text: 'No safe-trip bonus: you went over the limit' });
  } else {
    ctx.send(uid, { t: 'toast', icon: '🏁', text: 'Arrived (trip too short for points)' });
  }
}

async function checkins(ctx: Ctx, user: UserRow, fix: Fix, day: number) {
  const b = bbox(fix.lat, fix.lng, config.checkinRadiusM);
  const r = await ctx.db.query('SELECT id, name, icon, lat, lng FROM places WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4', [b.minLat, b.maxLat, b.minLng, b.maxLng]);
  for (const p of r.rows) {
    if (distanceM(fix, p) > config.checkinRadiusM) continue;
    const ins = await ctx.db.query('INSERT INTO checkins(user_id,place_id,day) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING place_id', [user.id, p.id, day]);
    if (ins.rowCount) await award(ctx, String(user.id), 'checkin', `Checked in at ${p.icon} ${p.name}`, { meta: { placeId: p.id } });
  }
}

async function hazardPrompt(ctx: Ctx, user: UserRow, fix: Fix) {
  const uid = String(user.id);
  const b = bbox(fix.lat, fix.lng, config.hazardPromptRadiusM);
  const r = await ctx.db.query(
    `SELECT h.*, u.name AS reporter_name FROM hazards h LEFT JOIN users u ON u.id=h.reporter_id
     WHERE NOT h.removed AND h.expires_at > now() AND h.lat BETWEEN $1 AND $2 AND h.lng BETWEEN $3 AND $4
       AND (h.reporter_id IS NULL OR h.reporter_id <> $5)
       AND NOT EXISTS (SELECT 1 FROM hazard_votes v WHERE v.hazard_id=h.id AND v.user_id=$5)
     LIMIT 5`,
    [b.minLat, b.maxLat, b.minLng, b.maxLng, uid],
  );
  for (const h of r.rows) {
    if (distanceM(fix, h) > config.hazardPromptRadiusM) continue;
    if (!(await ctx.redis.sadd(promptedKey(uid), String(h.id)))) continue;
    await ctx.redis.expire(promptedKey(uid), 86400);
    ctx.send(uid, {
      t: 'hazardPrompt',
      hazard: { id: String(h.id), type: h.type as HazardType, lat: h.lat, lng: h.lng, reporterName: h.reporter_name ?? 'A driver', mine: false, confirms: h.confirms, createdAt: new Date(h.created_at).toISOString() },
    });
    return; // one prompt at a time
  }
}

async function encounters(ctx: Ctx, user: UserRow, fix: Fix, prev: Fix | null, delta: number, now: Date) {
  const uid = String(user.id);
  const rules = ctx.rules();
  const base = param(rules, 'newface');
  const searchR = Math.max(base * 2.5 * 2, config.convoyRadiusM + 50) + delta;
  const others = (await nearby(ctx, fix.lat, fix.lng, searchR, 60)).filter((o) => o.id !== uid);
  if (!others.length) return;
  const myRadiusBoost = await ctx.redis.exists(keys.radiusBoost(uid));
  const utcDay = Math.floor(ctx.now() / 86400000);
  const gapMs = param(rules, 'sameagain') * 60_000;
  const buddyN = param(rules, 'buddy');
  const convoyGoal = param(rules, 'convoy');
  let profs: Map<string, { name: string }> | null = null;
  const nameOf = async (id: string) => {
    profs ??= await profiles(ctx, others.map((o) => o.id));
    return profs.get(id)?.name ?? 'a driver';
  };

  for (const o of others) await pairMutex.run(pairKey(uid, o.id), async () => {
    const pair = await getPair(ctx, uid, o.id);
    const boosted = myRadiusBoost || (await ctx.redis.exists(keys.radiusBoost(o.id)));
    const radiusM = base * (boosted ? 2 : 1);
    // Closest approach along my last movement, so fast crossings between GPS updates still count.
    const otherFix = prev && delta > 0 ? await lastFix(ctx, o.id) : null;
    const approach = otherFix && prev ? Math.min(o.distM, distanceToSegmentM(otherFix, prev, fix)) : o.distM;
    const { state, event } = stepPair(pair, approach, ctx.now(), utcDay, { radiusM, gapMs, maxPerDay: config.maxPassesPerPairPerDay });
    if (approach < o.distM && o.distM > radiusM * 2.5) state.near = false; // already past each other
    const next = { ...pair, ...state };

    // Convoy: distance driven while within 150 m of each other (each side adds half).
    if (o.distM < config.convoyRadiusM && delta > 0) {
      next.convoyM += delta / 2;
      if (next.convoyM >= convoyGoal && next.convoyDay !== utcDay) {
        next.convoyDay = utcDay;
        next.convoyM = 0;
        const otherName = await nameOf(o.id);
        await award(ctx, uid, 'convoy', `Convoy with ${otherName}`);
        await award(ctx, o.id, 'convoy', `Convoy with ${user.name}`);
      }
    } else if (o.distM > config.convoyRadiusM + 50) {
      next.convoyM = 0;
    }

    if (event) {
      const [lo, hi] = orderIds(uid, o.id);
      await ctx.db.query(
        `INSERT INTO encounters(user_a,user_b,passes,last_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (user_a,user_b) DO UPDATE SET passes=EXCLUDED.passes, last_at=now()`,
        [lo, hi, next.passes],
      );
      const otherName = await nameOf(o.id);
      if (event.kind === 'first') {
        await award(ctx, uid, 'newface', `Passed ${otherName} for the first time`);
        await award(ctx, o.id, 'newface', `Passed ${user.name} for the first time`);
      } else {
        await award(ctx, uid, 'sameagain', `Passed ${otherName} again (${event.count}×)`);
        await award(ctx, o.id, 'sameagain', `Passed ${user.name} again (${event.count}×)`);
      }
      if (next.passes >= buddyN && !next.buddy) {
        next.buddy = true;
        await award(ctx, uid, 'buddy', `You & ${otherName} are road buddies`);
        await award(ctx, o.id, 'buddy', `You & ${user.name} are road buddies`);
      }
      await firstOfDay(ctx, uid, user.tz, 'firstPass', 'First pass of the day', now);
      const other = await getUser(ctx, o.id);
      if (other) await firstOfDay(ctx, o.id, other.tz, 'firstPass', 'First pass of the day', now);
    }
    await savePair(ctx, uid, o.id, next);
  });
}

export async function firstOfDay(ctx: Ctx, uid: string, tz: string, field: string, text: string, now: Date) {
  const dk = dayKey(uid, localDayIndex(now, tz));
  if (await ctx.redis.hsetnx(dk, field, '1')) {
    await ctx.redis.expire(dk, 3 * 86400);
    await award(ctx, uid, 'firstday', text);
  }
}

export const dailyKey = dayKey;

async function pushNearby(ctx: Ctx, uid: string, fix: Fix) {
  const list = (await nearby(ctx, fix.lat, fix.lng, config.nearbyRadiusM, 50)).filter((o) => o.id !== uid);
  const ids = list.map((o) => o.id);
  const [profs, passes, fixes] = await Promise.all([
    profiles(ctx, ids),
    pairPasses(ctx, uid, ids),
    Promise.all(ids.map((id) => lastFix(ctx, id))),
  ]);
  const drivers: PublicDriver[] = [];
  ids.forEach((id, i) => {
    const p = profs.get(id);
    const f = fixes[i];
    if (!p || !f) return;
    drivers.push({ id, name: p.name, lat: f.lat, lng: f.lng, heading: f.heading ?? 0, vehicleType: p.vehicleType, brand: p.brand, color: p.color, skin: p.skin, passes: passes[i] ?? 0 });
  });
  ctx.send(uid, { t: 'nearby', drivers });
}

export { HAZARDS };

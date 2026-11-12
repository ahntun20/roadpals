/**
 * End-to-end tests against a real Postgres and Redis.
 * Uses TEST_DATABASE_URL / TEST_REDIS_URL (defaults: local roadpals_test DB and Redis db 15).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import WebSocket from 'ws';
import { offset, type LatLng, type ServerMsg } from '@roadpals/shared';

process.env.ADMIN_TOKEN = 'test-admin';
process.env.DEV_LOGIN = 'true';
process.env.JOB_INTERVAL_MS = '3600000';

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://roadpals:roadpals@localhost:5432/roadpals_test';
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

const { buildApp } = await import('../src/app');
const { createDb, migrate } = await import('../src/db');
const { payWeeklyPrizes } = await import('../src/services/social');

let clock = Date.UTC(2026, 10, 12, 13, 0, 0); // a Thursday, 8 AM in New York (rush hour)
const now = () => clock;

const db = createDb(DB_URL);
const redis = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);
let built: Awaited<ReturnType<typeof buildApp>>;
let baseUrl = '';

const BASE: LatLng = { lat: 40.758, lng: -73.9855 };

interface U { id: string; token: string; name: string; inviteCode: string }

async function api(method: string, url: string, token?: string, body?: unknown) {
  const res = await built.app.inject({ method: method as 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as object });
  return { status: res.statusCode, body: res.json() };
}

async function signup(name: string, phone: string, extra: Record<string, unknown> = {}): Promise<U> {
  const r = await api('POST', '/v1/auth/request-code', undefined, { phone });
  expect(r.status).toBe(200);
  const v = await api('POST', '/v1/auth/verify', undefined, { phone, code: r.body.devCode, name, tz: 'America/New_York', ...extra });
  expect(v.status).toBe(200);
  return { id: v.body.me.id, token: v.body.token, name, inviteCode: v.body.me.inviteCode };
}

async function fix(u: U, p: LatLng, speed = 14) {
  const r = await api('POST', '/v1/locations', u.token, { fixes: [{ lat: p.lat, lng: p.lng, ts: clock, speed, accuracy: 5 }] });
  expect(r.status).toBe(200);
  return r.body as { accepted: number; rejected: number };
}

async function ledger(u: U) {
  return (await api('GET', '/v1/me/ledger?limit=200', u.token)).body.entries as { ruleId: string | null; amount: number; text: string; kind: string }[];
}
const rulesEarned = async (u: U) => (await ledger(u)).filter((e) => e.kind === 'earn').map((e) => e.ruleId);

/** Drive in a straight line, one fix every `stepS` seconds, advancing the clock. */
async function drive(u: U, from: LatLng, bearing: number, meters: number, speed = 14, stepS = 5) {
  let p = from;
  await fix(u, p, speed);
  for (let d = 0; d < meters; d += speed * stepS) {
    clock += stepS * 1000;
    p = offset(p, speed * stepS, bearing);
    await fix(u, p, speed);
  }
  return p;
}

function connect(u: U): Promise<{ ws: WebSocket; msgs: ServerMsg[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/v1/ws?token=${u.token}`);
    const msgs: ServerMsg[] = [];
    ws.on('message', (m) => msgs.push(JSON.parse(m.toString())));
    ws.on('open', () => resolve({ ws, msgs }));
    ws.on('error', reject);
  });
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  await redis.flushdb();
  built = await buildApp({ db, redis, sub, now });
  baseUrl = await built.app.listen({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  await built.app.close();
  await db.end();
  redis.disconnect();
  sub.disconnect();
});

describe('RoadPals end to end', () => {
  let ann: U, ben: U, cat: U;

  it('signs drivers up with phone codes and invites', async () => {
    ann = await signup('Ann', '+15550000001', { vehicleType: 'car', vehicleBrand: 'Toyota' });
    ben = await signup('Ben', '+15550000002', { vehicleType: 'taxi', inviteCode: ann.inviteCode });
    cat = await signup('Cat', '+15550000003', { vehicleType: 'bus' });
    const wrong = await api('POST', '/v1/auth/verify', undefined, { phone: '+15550000009', code: '123456', name: 'Xavier' });
    expect(wrong.status).toBe(401);
    const me = await api('GET', '/v1/me', ben.token);
    expect(me.body.vehicleBrand).toBe('City Cab');
    expect(me.body.profile.color).toBe('#facc15');
  });

  it('awards km, rush-hour, streak, new areas and check-ins while driving', async () => {
    const place = offset(BASE, 700, 90);
    const ok = await api('POST', '/v1/admin/places', undefined, { name: 'Bean There Café', icon: '☕', lat: place.lat, lng: place.lng });
    expect(ok.status).toBe(403); // admin token required
    const a = await built.app.inject({ method: 'POST', url: '/v1/admin/places', headers: { 'x-admin-token': 'test-admin' }, payload: { name: 'Bean There Café', icon: '☕', lat: place.lat, lng: place.lng } });
    expect(a.statusCode).toBe(200);

    await drive(ann, BASE, 90, 1300);
    const earned = await rulesEarned(ann);
    expect(earned).toContain('km');
    expect(earned).toContain('rush'); // 8 AM local
    expect(earned).toContain('streak');
    expect(earned).toContain('explore');
    expect(earned).toContain('checkin');
    const me = (await api('GET', '/v1/me', ann.token)).body;
    expect(me.stats.km).toBeGreaterThan(1.2);
    expect(me.stats.streak).toBe(1);
  });

  it('rejects teleports and mock locations', async () => {
    clock += 5000;
    const far = offset(BASE, 50_000, 0);
    const r = await fix(ann, far);
    expect(r.rejected).toBe(1);
    const m = await api('POST', '/v1/locations', ann.token, { fixes: [{ lat: BASE.lat, lng: BASE.lng, ts: clock, mocked: true }] });
    expect(m.body.rejected).toBe(1);
    const row = await db.query('SELECT cheat_score FROM users WHERE id=$1', [ann.id]);
    expect(row.rows[0].cheat_score).toBe(2);
  });

  it('detects passes between fast cars, then repeat passes after the gap', async () => {
    // Ann heads west, Ben heads east on the same street: closing at ~100 km/h.
    const west = offset(BASE, 2500, 0);
    let a = offset(west, 1000, 90), b = west;
    clock += 10 * 60_000;
    await fix(ann, a); await fix(ben, b);
    for (let i = 0; i < 16; i++) {
      clock += 5000;
      a = offset(a, 70, 270); b = offset(b, 70, 90);
      await fix(ann, a); await fix(ben, b);
    }
    expect(await rulesEarned(ann)).toContain('newface');
    expect(await rulesEarned(ben)).toContain('newface');
    expect(await rulesEarned(ben)).toContain('firstday');

    // Drive back towards each other after 3 minutes → "same driver again".
    clock += 3 * 60_000;
    for (let i = 0; i < 16; i++) {
      clock += 5000;
      a = offset(a, 70, 90); b = offset(b, 70, 270);
      await fix(ann, a); await fix(ben, b);
    }
    expect(await rulesEarned(ann)).toContain('sameagain');
    const pair = await db.query('SELECT passes FROM encounters');
    expect(pair.rows[0].passes).toBe(2);
  });

  it('pays the inviter when the invited friend drives their first km', async () => {
    clock += 15 * 60_000; // long enough that the move isn't a teleport
    await drive(ben, offset(BASE, 4000, 180), 90, 1200);
    const inviteRows = (await ledger(ann)).filter((e) => e.ruleId === 'invite');
    expect(inviteRows.length).toBe(1);
  });

  it('delivers waves in real time, locks waving while driving, and pays mutual waves', async () => {
    const spot = offset(BASE, 6000, 0);
    clock += 15 * 60_000; // long enough that the move isn't a teleport
    await fix(ann, spot, 0);
    await fix(ben, offset(spot, 40, 90), 0);
    const bws = await connect(ben);
    const aws = await connect(ann);

    // Ann is "driving" fast and not a passenger → locked.
    clock += 1000;
    await fix(ann, offset(spot, 20, 0), 12);
    const locked = await api('POST', '/v1/waves', ann.token);
    expect(locked.body).toEqual({ ok: false, reason: 'locked_while_driving' });

    await api('PATCH', '/v1/me', ann.token, { passengerMode: true });
    const w = await api('POST', '/v1/waves', ann.token);
    expect(w.body).toEqual({ ok: true, to: ben.id, mutual: false });
    await wait(150);
    expect(bws.msgs.some((m) => m.t === 'waved' && m.from.name === 'Ann')).toBe(true);
    expect(await rulesEarned(ben)).toContain('wavedAt');

    const back = await api('POST', '/v1/waves', ben.token);
    expect(back.body.mutual).toBe(true);
    expect(await rulesEarned(ann)).toContain('mutual');
    expect(await rulesEarned(ben)).toContain('mutual');
    await wait(150);
    expect(aws.msgs.some((m) => m.t === 'points')).toBe(true);
    bws.ws.close(); aws.ws.close();
  });

  it('runs the hazard report → prompt → confirm loop', async () => {
    const road = offset(BASE, 8000, 0);
    clock += 15 * 60_000; // long enough that the move isn't a teleport
    const rep = await api('POST', '/v1/hazards', ann.token, { type: 'pothole', lat: road.lat, lng: road.lng });
    expect(rep.status).toBe(200);
    const id = rep.body.hazard.id;
    expect(await rulesEarned(ann)).toContain('report');

    const cws = await connect(cat);
    await drive(cat, offset(road, 300, 270), 90, 300);
    await wait(150);
    const prompt = cws.msgs.find((m) => m.t === 'hazardPrompt');
    expect(prompt && prompt.t === 'hazardPrompt' && prompt.hazard.id).toBe(id);
    const v = await api('POST', `/v1/hazards/${id}/vote`, cat.token, { stillThere: true });
    expect(v.status).toBe(200);
    expect(await rulesEarned(cat)).toContain('vote');
    expect(await rulesEarned(ann)).toContain('confirmed');
    const again = await api('POST', `/v1/hazards/${id}/vote`, cat.token, { stillThere: false });
    expect(again.status).toBe(400);
    cws.ws.close();
  });

  it('spends the balance in the shop without lowering lifetime points', async () => {
    await db.query('UPDATE users SET balance=balance+1000, lifetime_points=lifetime_points+1000 WHERE id=$1', [ann.id]);
    await db.query("INSERT INTO points_ledger(user_id,kind,rule_id,amount,text) VALUES ($1,'earn','km',1000,'test top-up')", [ann.id]);
    const before = (await api('GET', '/v1/me', ann.token)).body;
    const r = await api('POST', '/v1/shop/buy', ann.token, { itemId: 'skin:red' });
    expect(r.status).toBe(200);
    expect(r.body.me.balance).toBe(before.balance - 300);
    expect(r.body.me.lifetimePoints).toBe(before.lifetimePoints);
    expect(r.body.me.equipped.skin).toBe('skin:red');
    expect(r.body.me.profile.color).toBe('#ef4444');

    const coupon = await api('POST', '/v1/shop/buy', ann.token, { itemId: 'coupon:coffee' });
    expect(coupon.status).toBe(400); // needs 30 km first
    const boost = await api('POST', '/v1/shop/buy', ann.token, { itemId: 'boost:double' });
    expect(boost.body.me.boosts.doubleMsLeft).toBeGreaterThan(3_500_000);
    const gift = await api('POST', '/v1/shop/buy', ann.token, { itemId: 'gift:50' });
    expect(gift.status).toBe(200); // Ann has passed Ben
    const benLedger = await ledger(ben);
    expect(benLedger.some((e) => e.kind === 'gift' && e.amount === 50)).toBe(true);
    const broke = await api('POST', '/v1/shop/buy', cat.token, { itemId: 'skin:gold' });
    expect(broke.status).toBe(402);
  });

  it('pays the team challenge when the weekly goal is reached', async () => {
    const put = await built.app.inject({ method: 'PUT', url: '/v1/admin/rules', headers: { 'x-admin-token': 'test-admin' }, payload: { rules: { team: { param: { value: 10 } } } } });
    expect(put.statusCode).toBe(200);
    const t = await api('POST', '/v1/teams', ann.token, { name: 'Team Cyan' });
    const j = await api('POST', '/v1/teams/join', cat.token, { code: t.body.team.code });
    expect(j.body.team.name).toBe('Team Cyan');
    clock += 15 * 60_000; // long enough that the move isn't a teleport
    await drive(cat, offset(BASE, 12000, 0), 90, 10_500, 25, 5);
    expect(await rulesEarned(cat)).toContain('km');
    expect(await rulesEarned(ann)).toContain('team');
    expect(await rulesEarned(cat)).toContain('team');
    const team = await api('GET', '/v1/teams/me', ann.token);
    expect(team.body.team.rewarded).toBe(true);
  });

  it('shows the weekly leaderboard and pays prizes once', async () => {
    const lb = await api('GET', '/v1/leaderboard', ann.token);
    expect(lb.body.entries.length).toBe(3);
    const leader = lb.body.entries[0].id;
    clock += 7 * 86400_000;
    expect(await payWeeklyPrizes(built.ctx)).toBe(3);
    expect(await payWeeklyPrizes(built.ctx)).toBe(0); // idempotent
    const leaderUser = [ann, ben, cat].find((u) => u.id === leader)!;
    expect((await ledger(leaderUser)).some((e) => e.ruleId === 'weekly' && e.amount === 100)).toBe(true);
  });

  it('handles user ids past 9 (numeric ordering in the encounters table)', async () => {
    const extra: U[] = [];
    for (let i = 0; i < 9; i++) extra.push(await signup(`Extra${i}`, `+1555100000${i}`));
    const late = extra[extra.length - 1]; // id 12 vs Cat (id 3): "12" < "3" as text
    expect(Number(late.id)).toBeGreaterThan(9);
    const spot = offset(BASE, 20_000, 0);
    let a = offset(spot, 600, 90), b = spot;
    clock += 30 * 60_000;
    await fix(cat, a); await fix(late, b);
    for (let i = 0; i < 10; i++) {
      clock += 5000;
      a = offset(a, 70, 270); b = offset(b, 70, 90);
      await fix(cat, a); await fix(late, b);
    }
    expect(await rulesEarned(late)).toContain('newface');
    const row = await db.query('SELECT passes FROM encounters WHERE user_a=$1 AND user_b=$2', [cat.id, late.id]);
    expect(row.rows[0].passes).toBe(1);
  });

  it('keeps every balance equal to its ledger', async () => {
    const r = await db.query(`
      SELECT u.id, u.balance, u.lifetime_points,
        COALESCE(SUM(l.amount),0)::int AS bal,
        COALESCE(SUM(l.amount) FILTER (WHERE l.kind IN ('earn','reverse')),0)::int AS life
      FROM users u LEFT JOIN points_ledger l ON l.user_id=u.id GROUP BY u.id`);
    for (const row of r.rows) {
      expect(row.balance).toBe(row.bal);
      expect(row.lifetime_points).toBe(row.life);
    }
  });
});

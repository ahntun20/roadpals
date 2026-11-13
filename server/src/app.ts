import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import {
  BRANDS, HAZARDS, distanceM, isValidLatLng, localDayIndex, param, SHOP_ITEMS, type ClientMsg, type HazardType,
} from '@roadpals/shared';
import { config } from './config';
import type { Ctx } from './ctx';
import type { Db } from './db';
import { Hub } from './hub';
import { RulesStore } from './rulesStore';
import { award, history, InsufficientBalance, reverse } from './services/ledger';
import { dailyKey, processFix } from './services/location';
import { HazardError, listNear, report, vote } from './services/hazards';
import { buy, coupons, equip, ShopError } from './services/shop';
import { createTeam, joinTeam, leaderboard, leaveTeam, myTeam, SocialError } from './services/social';
import { getUser, mePayload, refreshProfile } from './services/users';
import { wave } from './services/waves';
import { bbox, code, otp } from './util';
import { removePosition } from './services/live';

declare module 'fastify' {
  interface FastifyRequest { uid: string }
}

export interface AppDeps { db: Db; redis: Redis; sub: Redis; now?: () => number; logger?: boolean }

const fixSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ts: z.number().int().positive(),
  speed: z.number().min(-1).max(200).nullish(),
  heading: z.number().min(-1).max(360).nullish(),
  accuracy: z.number().min(0).max(10000).nullish(),
  mocked: z.boolean().optional(),
});
const phoneSchema = z.string().transform((s) => s.replace(/[^\d+]/g, '')).pipe(z.string().regex(/^\+?\d{8,16}$/, 'Enter a valid phone number'));
const vehicleTypes = ['car', 'taxi', 'bus', 'truck', 'container'] as const;

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: true });
  const rulesStore = new RulesStore(deps.db);
  await rulesStore.load();
  const hub = new Hub(deps.redis, deps.sub);
  await hub.start();
  const ctx: Ctx = { db: deps.db, redis: deps.redis, rules: rulesStore.get, send: hub.send, now: deps.now ?? Date.now };

  await app.register(cors, { origin: true });
  // preHandler hook so per-route key generators can read the parsed body (phone number).
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute', redis: deps.redis, hook: 'preHandler' });
  await app.register(websocket);

  // Map known errors to clean 4xx responses.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: err.issues[0]?.message ?? 'Invalid request' });
    if (err instanceof InsufficientBalance) return reply.code(402).send({ error: err.message });
    if (err instanceof ShopError || err instanceof HazardError || err instanceof SocialError) return reply.code(400).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong' });
  });

  const sign = (uid: string) => jwt.sign({ sub: uid }, config.jwtSecret, { expiresIn: '30d' });
  const verifyToken = (t: string | undefined): string | null => {
    if (!t) return null;
    try { return String((jwt.verify(t, config.jwtSecret) as jwt.JwtPayload).sub); } catch { return null; }
  };
  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = verifyToken(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!uid) return reply.code(401).send({ error: 'Sign in again' });
    req.uid = uid;
  };
  const admin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!config.adminToken || req.headers['x-admin-token'] !== config.adminToken) return reply.code(403).send({ error: 'Admin only' });
  };

  app.get('/health', async () => ({ ok: true, connections: hub.connections() }));

  // ---------- auth: phone number + 6-digit code ----------
  // Limit by phone number (not IP), so many users behind one network can still sign in.
  const byPhone = (req: FastifyRequest) => `phone:${String((req.body as { phone?: unknown })?.phone ?? req.ip)}`;
  app.post('/v1/auth/request-code', { config: { rateLimit: { max: 5, timeWindow: '10 minutes', keyGenerator: byPhone } } }, async (req) => {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
    const c = otp();
    await ctx.redis.set(`otp:${phone}`, JSON.stringify({ code: c, tries: 0 }), 'EX', 600);
    // Plug in your SMS provider here (e.g. Twilio Verify). In dev mode the code is returned.
    app.log.info({ phone }, 'verification code requested');
    return config.devLogin ? { sent: true, devCode: c } : { sent: true };
  });

  app.post('/v1/auth/verify', { config: { rateLimit: { max: 10, timeWindow: '10 minutes', keyGenerator: byPhone } } }, async (req, reply) => {
    const body = z.object({
      phone: phoneSchema,
      code: z.string().regex(/^\d{6}$/),
      name: z.string().trim().min(2).max(24).optional(),
      tz: z.string().max(64).optional(),
      vehicleType: z.enum(vehicleTypes).optional(),
      vehicleBrand: z.string().max(32).optional(),
      inviteCode: z.string().max(16).optional(),
    }).parse(req.body);
    const stored = await ctx.redis.get(`otp:${body.phone}`);
    const rec = stored ? (JSON.parse(stored) as { code: string; tries: number }) : null;
    const ok = (config.devLogin && body.code === '000000') || (rec && rec.code === body.code);
    if (!ok) {
      if (rec) {
        rec.tries++;
        if (rec.tries >= 5) await ctx.redis.del(`otp:${body.phone}`);
        else await ctx.redis.set(`otp:${body.phone}`, JSON.stringify(rec), 'KEEPTTL');
      }
      return reply.code(401).send({ error: 'Wrong code' });
    }
    let user = (await ctx.db.query('SELECT * FROM users WHERE phone=$1', [body.phone])).rows[0];
    let isNew = false;
    if (!user) {
      // Keep the code valid: the app sends it again with the new driver's name and vehicle.
      if (!body.name) return reply.code(400).send({ error: 'Choose a driver name', needsProfile: true });
      const inviter = body.inviteCode ? (await ctx.db.query('SELECT id FROM users WHERE invite_code=$1', [body.inviteCode.toUpperCase()])).rows[0] : null;
      const type = body.vehicleType ?? 'car';
      const brand = BRANDS[type].some((b) => b.name === body.vehicleBrand) ? body.vehicleBrand! : BRANDS[type][0].name;
      for (let i = 0; i < 5 && !user; i++) {
        user = (await ctx.db.query(
          `INSERT INTO users(phone,name,tz,vehicle_type,vehicle_brand,invite_code,invited_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (invite_code) DO NOTHING RETURNING *`,
          [body.phone, body.name, body.tz ?? 'UTC', type, brand, code(7), inviter?.id ?? null],
        )).rows[0];
      }
      isNew = true;
    }
    await ctx.redis.del(`otp:${body.phone}`); // single use, once sign-in has succeeded
    await refreshProfile(ctx, user);
    return { token: sign(String(user.id)), isNew, me: await mePayload(ctx, user) };
  });

  // ---------- me ----------
  app.get('/v1/me', { preHandler: auth }, async (req, reply) => {
    const u = await getUser(ctx, req.uid);
    if (!u) return reply.code(404).send({ error: 'No user' });
    return mePayload(ctx, u);
  });

  app.patch('/v1/me', { preHandler: auth }, async (req) => {
    const b = z.object({
      name: z.string().trim().min(2).max(24).optional(),
      tz: z.string().max(64).optional(),
      vehicleType: z.enum(vehicleTypes).optional(),
      vehicleBrand: z.string().max(32).optional(),
      passengerMode: z.boolean().optional(),
    }).parse(req.body);
    const u = (await getUser(ctx, req.uid))!;
    const type = b.vehicleType ?? u.vehicle_type;
    let brand = b.vehicleBrand ?? (b.vehicleType ? BRANDS[type][0].name : u.vehicle_brand);
    if (!BRANDS[type].some((x) => x.name === brand)) brand = BRANDS[type][0].name;
    const r = await ctx.db.query(
      'UPDATE users SET name=$2, tz=$3, vehicle_type=$4, vehicle_brand=$5, passenger_mode=$6 WHERE id=$1 RETURNING *',
      [req.uid, b.name ?? u.name, b.tz ?? u.tz, type, brand, b.passengerMode ?? u.passenger_mode],
    );
    await refreshProfile(ctx, r.rows[0]);
    return mePayload(ctx, r.rows[0]);
  });

  app.get('/v1/me/ledger', { preHandler: auth }, async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    return { entries: await history(ctx, req.uid, limit) };
  });

  app.get('/v1/rules', async () => ({ rules: Object.values(ctx.rules()) }));
  app.get('/v1/catalog', async () => ({ items: SHOP_ITEMS, brands: BRANDS, hazards: HAZARDS }));

  // ---------- driving ----------
  // Background GPS uploads arrive here in batches; the live app also streams fixes over the WebSocket.
  app.post('/v1/locations', { preHandler: auth }, async (req) => {
    const { fixes } = z.object({ fixes: z.array(fixSchema).min(1).max(300) }).parse(req.body);
    fixes.sort((a, b) => a.ts - b.ts);
    let accepted = 0;
    for (const f of fixes) if ((await processFix(ctx, req.uid, f)).accepted) accepted++;
    return { accepted, rejected: fixes.length - accepted };
  });

  app.post('/v1/stop', { preHandler: auth }, async (req) => {
    await removePosition(ctx, req.uid); // hide me from the live map (parked / app closed)
    return { ok: true };
  });

  app.post('/v1/waves', { preHandler: auth }, async (req) => wave(ctx, req.uid));

  app.post('/v1/trips', { preHandler: auth }, async (req) => {
    const b = z.object({ lat: z.number(), lng: z.number() }).parse(req.body);
    if (!isValidLatLng(b)) throw new ShopError('Bad destination');
    const u = (await getUser(ctx, req.uid))!;
    const trip = { lat: b.lat, lng: b.lng, startOdoM: u.odo_m, speeding: false, startedAt: ctx.now() };
    await ctx.db.query('UPDATE users SET active_trip=$2 WHERE id=$1', [req.uid, JSON.stringify(trip)]);
    return { trip };
  });
  app.delete('/v1/trips', { preHandler: auth }, async (req) => {
    await ctx.db.query('UPDATE users SET active_trip=NULL WHERE id=$1', [req.uid]);
    return { ok: true };
  });

  // Optional routing through your own OSRM server.
  app.get('/v1/route', { preHandler: auth }, async (req, reply) => {
    const q = z.object({ fromLat: z.coerce.number(), fromLng: z.coerce.number(), toLat: z.coerce.number(), toLng: z.coerce.number() }).parse(req.query);
    if (!config.osrmUrl) return reply.code(501).send({ error: 'Routing not configured (set OSRM_URL)' });
    const url = `${config.osrmUrl}/route/v1/driving/${q.fromLng},${q.fromLat};${q.toLng},${q.toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return reply.code(502).send({ error: 'Routing failed' });
    const data = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const r = data.routes?.[0];
    if (!r) return reply.code(404).send({ error: 'No route' });
    return { distanceM: r.distance, durationS: r.duration, points: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) };
  });

  // ---------- hazards, places, map edits ----------
  app.get('/v1/hazards', { preHandler: auth }, async (req) => {
    const q = z.object({ lat: z.coerce.number(), lng: z.coerce.number(), radius: z.coerce.number().max(20000).default(3000) }).parse(req.query);
    return { hazards: await listNear(ctx, req.uid, q.lat, q.lng, q.radius) };
  });
  app.post('/v1/hazards', { preHandler: auth }, async (req) => {
    const b = z.object({ type: z.enum(Object.keys(HAZARDS) as [HazardType, ...HazardType[]]), lat: z.number(), lng: z.number() }).parse(req.body);
    return { hazard: await report(ctx, req.uid, b.type, b.lat, b.lng) };
  });
  app.post('/v1/hazards/:id/vote', { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(req.params);
    const { stillThere } = z.object({ stillThere: z.boolean() }).parse(req.body);
    return vote(ctx, req.uid, id, stillThere);
  });

  app.get('/v1/places', { preHandler: auth }, async (req) => {
    const q = z.object({ lat: z.coerce.number(), lng: z.coerce.number(), radius: z.coerce.number().max(20000).default(3000) }).parse(req.query);
    const b = bbox(q.lat, q.lng, q.radius);
    const r = await ctx.db.query('SELECT id,name,icon,lat,lng,partner FROM places WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4 LIMIT 200', [b.minLat, b.maxLat, b.minLng, b.maxLng]);
    const u = (await getUser(ctx, req.uid))!;
    const day = localDayIndex(new Date(ctx.now()), u.tz);
    const done = await ctx.db.query('SELECT place_id FROM checkins WHERE user_id=$1 AND day=$2', [req.uid, day]);
    const set = new Set(done.rows.map((d) => String(d.place_id)));
    return { places: r.rows.filter((p) => distanceM(q, p) <= q.radius).map((p) => ({ ...p, id: String(p.id), checkedInToday: set.has(String(p.id)) })) };
  });

  app.post('/v1/map-edits', { preHandler: auth }, async (req) => {
    const b = z.object({ lat: z.number(), lng: z.number(), kind: z.enum(['road_name', 'other']), value: z.string().trim().min(2).max(80) }).parse(req.body);
    const r = await ctx.db.query('INSERT INTO map_edits(user_id,lat,lng,kind,value) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.uid, b.lat, b.lng, b.kind, b.value]);
    const u = (await getUser(ctx, req.uid))!;
    const dk = dailyKey(req.uid, localDayIndex(new Date(ctx.now()), u.tz));
    const n = await ctx.redis.hincrby(dk, 'edits', 1);
    await ctx.redis.expire(dk, 3 * 86400);
    if (n <= param(ctx.rules(), 'mapedit')) await award(ctx, req.uid, 'mapedit', b.kind === 'road_name' ? `Suggested a road name: ${b.value}` : 'Suggested a map fix', { meta: { editId: r.rows[0].id } });
    return { id: String(r.rows[0].id), status: 'pending' };
  });

  // ---------- shop ----------
  app.post('/v1/shop/buy', { preHandler: auth }, async (req) => {
    const b = z.object({ itemId: z.string(), giftTo: z.string().regex(/^\d+$/).optional() }).parse(req.body);
    const result = await buy(ctx, req.uid, b.itemId, { giftTo: b.giftTo });
    return { ...result, me: await mePayload(ctx, (await getUser(ctx, req.uid))!) };
  });
  app.post('/v1/shop/equip', { preHandler: auth }, async (req) => {
    const b = z.object({ itemId: z.string() }).parse(req.body);
    await equip(ctx, req.uid, b.itemId);
    return { me: await mePayload(ctx, (await getUser(ctx, req.uid))!) };
  });
  app.get('/v1/coupons', { preHandler: auth }, async (req) => ({ coupons: await coupons(ctx, req.uid) }));

  // ---------- social ----------
  app.get('/v1/leaderboard', { preHandler: auth }, async (req) => leaderboard(ctx, req.uid));
  app.get('/v1/teams/me', { preHandler: auth }, async (req) => ({ team: await myTeam(ctx, req.uid) }));
  app.post('/v1/teams', { preHandler: auth }, async (req) => ({ team: await createTeam(ctx, req.uid, z.object({ name: z.string() }).parse(req.body).name) }));
  app.post('/v1/teams/join', { preHandler: auth }, async (req) => ({ team: await joinTeam(ctx, req.uid, z.object({ code: z.string() }).parse(req.body).code) }));
  app.post('/v1/teams/leave', { preHandler: auth }, async (req) => { await leaveTeam(ctx, req.uid); return { ok: true }; });

  // ---------- admin ----------
  app.put('/v1/admin/rules', { preHandler: admin }, async (req) => {
    const body = req.body as { rules?: unknown };
    const incoming = Array.isArray(body?.rules) ? Object.fromEntries((body.rules as { id: string }[]).map((r) => [r.id, r])) : body?.rules ?? body;
    return { rules: Object.values(await rulesStore.save({ ...ctx.rules(), ...(incoming as object) })) };
  });
  app.post('/v1/admin/places', { preHandler: admin }, async (req) => {
    const b = z.object({ name: z.string().min(2).max(60), icon: z.string().max(8).default('📍'), lat: z.number(), lng: z.number(), partner: z.boolean().default(false) }).parse(req.body);
    const r = await ctx.db.query('INSERT INTO places(name,icon,lat,lng,partner) VALUES ($1,$2,$3,$4,$5) RETURNING id', [b.name, b.icon, b.lat, b.lng, b.partner]);
    return { id: String(r.rows[0].id) };
  });
  app.get('/v1/admin/map-edits', { preHandler: admin }, async () => ({ edits: (await ctx.db.query("SELECT * FROM map_edits WHERE status='pending' ORDER BY id LIMIT 200")).rows }));
  app.post('/v1/admin/map-edits/:id', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { status } = z.object({ status: z.enum(['approved', 'rejected']) }).parse(req.body);
    await ctx.db.query('UPDATE map_edits SET status=$2 WHERE id=$1', [id, status]);
    return { ok: true };
  });
  app.post('/v1/admin/reverse', { preHandler: admin }, async (req) => {
    const b = z.object({ userId: z.string(), amount: z.number().int().positive(), reason: z.string().min(3) }).parse(req.body);
    await reverse(ctx, b.userId, b.amount, b.reason);
    return { ok: true };
  });

  // ---------- realtime ----------
  app.get('/v1/ws', { websocket: true }, (socket, req) => {
    const uid = verifyToken((req.query as { token?: string }).token);
    if (!uid) { socket.close(4401, 'unauthorized'); return; }
    hub.add(uid, socket);
    socket.send(JSON.stringify({ t: 'hello', userId: uid }));
    socket.on('message', async (raw: Buffer) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(raw.toString()) as ClientMsg; } catch { return; }
      try {
        if (msg.t === 'ping') socket.send(JSON.stringify({ t: 'pong' }));
        else if (msg.t === 'fix') {
          const f = fixSchema.safeParse(msg.fix);
          if (f.success) await processFix(ctx, uid, f.data);
        } else if (msg.t === 'wave') {
          const r = await wave(ctx, uid);
          socket.send(JSON.stringify(r.ok ? { t: 'waveResult', ok: true, to: r.to, mutual: r.mutual } : { t: 'waveResult', ok: false, reason: r.reason }));
        }
      } catch (e) {
        app.log.error(e);
      }
    });
  });

  return { app, ctx, hub, rulesStore };
}

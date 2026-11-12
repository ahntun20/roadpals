import { HAZARDS, distanceM, localDayIndex, param, type HazardDTO, type HazardType } from '@roadpals/shared';
import type { Ctx } from '../ctx';
import { bbox } from '../util';
import { award } from './ledger';
import { dailyKey } from './location';
import { getUser } from './users';

/** How long a report stays on the map unless drivers mark it gone. */
const LIFETIME_MIN: Record<HazardType, number> = { pothole: 7 * 24 * 60, police: 60, crash: 120, object: 120, jam: 45 };

export class HazardError extends Error {}

export async function report(ctx: Ctx, uid: string, type: HazardType, lat: number, lng: number): Promise<HazardDTO> {
  if (!(type in HAZARDS)) throw new HazardError('Unknown hazard type');
  const user = await getUser(ctx, uid);
  if (!user) throw new HazardError('No user');
  // Don't stack duplicates: a report of the same type within 50 m counts as a confirmation instead.
  const b = bbox(lat, lng, 50);
  const dup = await ctx.db.query(
    'SELECT id FROM hazards WHERE NOT removed AND expires_at>now() AND type=$1 AND lat BETWEEN $2 AND $3 AND lng BETWEEN $4 AND $5 LIMIT 1',
    [type, b.minLat, b.maxLat, b.minLng, b.maxLng],
  );
  if (dup.rowCount) {
    await vote(ctx, uid, String(dup.rows[0].id), true).catch(() => {});
    return (await get(ctx, String(dup.rows[0].id), uid))!;
  }
  const r = await ctx.db.query(
    `INSERT INTO hazards(type,lat,lng,reporter_id,expires_at) VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval) RETURNING *`,
    [type, lat, lng, uid, String(LIFETIME_MIN[type])],
  );
  const dk = dailyKey(uid, localDayIndex(new Date(ctx.now()), user.tz));
  const n = await ctx.redis.hincrby(dk, 'reports', 1);
  await ctx.redis.expire(dk, 3 * 86400);
  if (n <= param(ctx.rules(), 'report')) await award(ctx, uid, 'report', `Reported ${HAZARDS[type].label.toLowerCase()}`, { meta: { hazardId: r.rows[0].id } });
  return toDTO(r.rows[0], user.name, uid);
}

export async function vote(ctx: Ctx, uid: string, hazardId: string, stillThere: boolean): Promise<{ removed: boolean }> {
  const h = await ctx.db.query('SELECT * FROM hazards WHERE id=$1', [hazardId]);
  if (!h.rowCount) throw new HazardError('Hazard not found');
  const hz = h.rows[0];
  if (String(hz.reporter_id) === uid) throw new HazardError('You reported this one');
  const ins = await ctx.db.query('INSERT INTO hazard_votes(hazard_id,user_id,still_there) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING hazard_id', [hazardId, uid, stillThere]);
  if (!ins.rowCount) throw new HazardError('Already voted');
  const label = HAZARDS[hz.type as HazardType]?.label.toLowerCase() ?? 'hazard';
  await award(ctx, uid, 'vote', stillThere ? `Confirmed a ${label}` : `Marked a ${label} as gone`);
  if (stillThere) {
    const up = await ctx.db.query('UPDATE hazards SET confirms=confirms+1, expires_at=GREATEST(expires_at, now() + interval \'30 minutes\') WHERE id=$1 RETURNING confirms', [hazardId]);
    if (hz.reporter_id && up.rows[0].confirms <= param(ctx.rules(), 'confirmed')) {
      const voter = await getUser(ctx, uid);
      await award(ctx, String(hz.reporter_id), 'confirmed', `${voter?.name ?? 'A driver'} confirmed your ${label} report`);
    }
    return { removed: false };
  }
  const up = await ctx.db.query('UPDATE hazards SET gone_votes=gone_votes+1, removed = (gone_votes+1 >= 2) WHERE id=$1 RETURNING removed', [hazardId]);
  return { removed: up.rows[0].removed };
}

export async function listNear(ctx: Ctx, uid: string, lat: number, lng: number, radiusM = 3000): Promise<HazardDTO[]> {
  const b = bbox(lat, lng, radiusM);
  const r = await ctx.db.query(
    `SELECT h.*, u.name AS reporter_name FROM hazards h LEFT JOIN users u ON u.id=h.reporter_id
     WHERE NOT h.removed AND h.expires_at>now() AND h.lat BETWEEN $1 AND $2 AND h.lng BETWEEN $3 AND $4 ORDER BY h.created_at DESC LIMIT 200`,
    [b.minLat, b.maxLat, b.minLng, b.maxLng],
  );
  return r.rows.filter((h) => distanceM({ lat, lng }, h) <= radiusM).map((h) => toDTO(h, h.reporter_name, uid));
}

async function get(ctx: Ctx, id: string, uid: string): Promise<HazardDTO | null> {
  const r = await ctx.db.query('SELECT h.*, u.name AS reporter_name FROM hazards h LEFT JOIN users u ON u.id=h.reporter_id WHERE h.id=$1', [id]);
  return r.rowCount ? toDTO(r.rows[0], r.rows[0].reporter_name, uid) : null;
}

function toDTO(h: { id: string; type: HazardType; lat: number; lng: number; reporter_id: string | null; confirms: number; created_at: Date }, reporterName: string | null, uid: string): HazardDTO {
  return { id: String(h.id), type: h.type, lat: h.lat, lng: h.lng, reporterName: reporterName ?? 'A driver', mine: String(h.reporter_id) === uid, confirms: h.confirms, createdAt: new Date(h.created_at).toISOString() };
}

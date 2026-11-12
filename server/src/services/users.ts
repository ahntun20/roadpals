import { brandColor, isVehicleType, levelFor, shopItem, type VehicleType } from '@roadpals/shared';
import type { Ctx } from '../ctx';
import { cacheProfile, getProfiles, type Profile } from './live';
import { keys } from './ledger';

export interface UserRow {
  id: string;
  phone: string;
  name: string;
  tz: string;
  vehicle_type: VehicleType;
  vehicle_brand: string;
  passenger_mode: boolean;
  lifetime_points: number;
  balance: number;
  odo_m: number;
  legal_m: number;
  km_awarded: number;
  explored_cells: number;
  streak: number;
  streak_day: number;
  freezes: number;
  equipped_skin: string;
  equipped_wave: string;
  equipped_theme: string;
  team_id: string | null;
  invite_code: string;
  invited_by: string | null;
  invite_rewarded: boolean;
  cheat_score: number;
  active_trip: ActiveTrip | null;
  last_drive_at: Date | null;
  created_at: Date;
}

export interface ActiveTrip { lat: number; lng: number; startOdoM: number; speeding: boolean; startedAt: number }

export async function getUser(ctx: Ctx, id: string): Promise<UserRow | null> {
  const r = await ctx.db.query('SELECT * FROM users WHERE id=$1', [id]);
  return (r.rows[0] as UserRow) ?? null;
}

export function profileOf(u: UserRow): Profile {
  const type = isVehicleType(u.vehicle_type) ? u.vehicle_type : 'car';
  const skin = shopItem(u.equipped_skin);
  return {
    id: String(u.id),
    name: u.name,
    vehicleType: type,
    brand: u.vehicle_brand,
    color: skin?.value ?? brandColor(type, u.vehicle_brand),
    skin: u.equipped_skin,
    wave: shopItem(u.equipped_wave)?.value ?? '👋',
  };
}

export async function refreshProfile(ctx: Ctx, u: UserRow): Promise<Profile> {
  const p = profileOf(u);
  await cacheProfile(ctx, p);
  return p;
}

/** Profiles for many users; falls back to Postgres for cache misses. */
export async function profiles(ctx: Ctx, ids: string[]): Promise<Map<string, Profile>> {
  const out = new Map<string, Profile>();
  const cached = await getProfiles(ctx, ids);
  const missing: string[] = [];
  cached.forEach((p, i) => (p ? out.set(ids[i], p) : missing.push(ids[i])));
  if (missing.length) {
    const r = await ctx.db.query('SELECT * FROM users WHERE id = ANY($1::bigint[])', [missing]);
    for (const row of r.rows as UserRow[]) out.set(String(row.id), await refreshProfile(ctx, row));
  }
  return out;
}

/** The "me" payload the app shows on its score card and profile screen. */
export async function mePayload(ctx: Ctx, u: UserRow) {
  const [inv, dbl, rad, team] = await Promise.all([
    ctx.db.query('SELECT item_id FROM inventory WHERE user_id=$1', [u.id]),
    ctx.redis.pttl(keys.doubleBoost(String(u.id))),
    ctx.redis.pttl(keys.radiusBoost(String(u.id))),
    u.team_id ? ctx.db.query('SELECT id, name, code FROM teams WHERE id=$1', [u.team_id]) : Promise.resolve(null),
  ]);
  const lvl = levelFor(u.lifetime_points);
  return {
    id: String(u.id),
    name: u.name,
    tz: u.tz,
    vehicleType: u.vehicle_type,
    vehicleBrand: u.vehicle_brand,
    passengerMode: u.passenger_mode,
    lifetimePoints: u.lifetime_points,
    balance: u.balance,
    level: { ...lvl.level, index: lvl.index, next: lvl.next, progress: lvl.progress },
    stats: { km: Math.round(u.odo_m / 100) / 10, legalKm: Math.round(u.legal_m / 100) / 10, exploredCells: u.explored_cells, streak: u.streak, freezes: u.freezes },
    equipped: { skin: u.equipped_skin, wave: u.equipped_wave, theme: u.equipped_theme },
    inventory: inv.rows.map((r) => r.item_id as string),
    boosts: { doubleMsLeft: Math.max(0, dbl), radiusMsLeft: Math.max(0, rad) },
    inviteCode: u.invite_code,
    team: team && team.rowCount ? { id: String(team.rows[0].id), name: team.rows[0].name, code: team.rows[0].code } : null,
    activeTrip: u.active_trip,
    profile: profileOf(u),
  };
}

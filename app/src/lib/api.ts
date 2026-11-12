import * as SecureStore from 'expo-secure-store';
import type { HazardDTO, HazardType, LedgerEntry, RuleDef, VehicleType } from '@roadpals/shared';
import { API_URL } from './config';

const TOKEN_KEY = 'roadpals.token';
// Readable after the first unlock, so background GPS uploads still work with the phone locked.
const STORE_OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY, STORE_OPTS);
}
export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token, STORE_OPTS);
  else await SecureStore.deleteItemAsync(TOKEN_KEY, STORE_OPTS);
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) { super(message); }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(json.error ?? `Request failed (${res.status})`), res.status, json);
  return json as T;
}

export interface Me {
  id: string;
  name: string;
  tz: string;
  vehicleType: VehicleType;
  vehicleBrand: string;
  passengerMode: boolean;
  lifetimePoints: number;
  balance: number;
  level: { name: string; icon: string; min: number; index: number; next: { name: string; min: number } | null; progress: number };
  stats: { km: number; legalKm: number; exploredCells: number; streak: number; freezes: number };
  equipped: { skin: string; wave: string; theme: string };
  inventory: string[];
  boosts: { doubleMsLeft: number; radiusMsLeft: number };
  inviteCode: string;
  team: { id: string; name: string; code: string } | null;
  activeTrip: { lat: number; lng: number } | null;
  profile: { color: string; wave: string };
}

export interface LeaderboardEntry { rank: number; id: string; score: number; name: string; vehicleType: VehicleType; brand: string; prize: number }
export interface Team { id: string; name: string; code: string; week: string; km: number; goalKm: number; rewarded: boolean; members: { id: string; name: string; vehicleType: VehicleType; brand: string }[] }
export interface Place { id: string; name: string; icon: string; lat: number; lng: number; checkedInToday: boolean }
export interface Coupon { id: string; name: string; code: string | null; status: string; readyAt: string }

export const api = {
  requestCode: (phone: string) => request<{ sent: boolean; devCode?: string }>('POST', '/v1/auth/request-code', { phone }),
  verify: (body: { phone: string; code: string; name?: string; tz?: string; vehicleType?: VehicleType; vehicleBrand?: string; inviteCode?: string }) =>
    request<{ token: string; isNew: boolean; me: Me }>('POST', '/v1/auth/verify', body),
  me: () => request<Me>('GET', '/v1/me'),
  updateMe: (body: Partial<{ name: string; tz: string; vehicleType: VehicleType; vehicleBrand: string; passengerMode: boolean }>) => request<Me>('PATCH', '/v1/me', body),
  ledger: (limit = 100) => request<{ entries: LedgerEntry[] }>('GET', `/v1/me/ledger?limit=${limit}`),
  rules: () => request<{ rules: RuleDef[] }>('GET', '/v1/rules'),
  sendFixes: (fixes: unknown[]) => request<{ accepted: number; rejected: number }>('POST', '/v1/locations', { fixes }),
  stop: () => request<{ ok: true }>('POST', '/v1/stop', {}),
  hazards: (lat: number, lng: number) => request<{ hazards: HazardDTO[] }>('GET', `/v1/hazards?lat=${lat}&lng=${lng}`),
  report: (type: HazardType, lat: number, lng: number) => request<{ hazard: HazardDTO }>('POST', '/v1/hazards', { type, lat, lng }),
  vote: (id: string, stillThere: boolean) => request<{ removed: boolean }>('POST', `/v1/hazards/${id}/vote`, { stillThere }),
  places: (lat: number, lng: number) => request<{ places: Place[] }>('GET', `/v1/places?lat=${lat}&lng=${lng}`),
  mapEdit: (lat: number, lng: number, value: string) => request<{ id: string }>('POST', '/v1/map-edits', { lat, lng, kind: 'road_name', value }),
  startTrip: (lat: number, lng: number) => request<{ trip: unknown }>('POST', '/v1/trips', { lat, lng }),
  cancelTrip: () => request<{ ok: true }>('DELETE', '/v1/trips'),
  route: (from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
    request<{ distanceM: number; durationS: number; points: { lat: number; lng: number }[] }>('GET', `/v1/route?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`),
  buy: (itemId: string) => request<{ ok: true; message: string; me: Me; coupon?: { code: string; readyAt: string } }>('POST', '/v1/shop/buy', { itemId }),
  equip: (itemId: string) => request<{ me: Me }>('POST', '/v1/shop/equip', { itemId }),
  coupons: () => request<{ coupons: Coupon[] }>('GET', '/v1/coupons'),
  leaderboard: () => request<{ week: string; entries: LeaderboardEntry[]; me: { rank: number | null; score: number } }>('GET', '/v1/leaderboard'),
  team: () => request<{ team: Team | null }>('GET', '/v1/teams/me'),
  createTeam: (name: string) => request<{ team: Team }>('POST', '/v1/teams', { name }),
  joinTeam: (code: string) => request<{ team: Team }>('POST', '/v1/teams/join', { code }),
  leaveTeam: () => request<{ ok: true }>('POST', '/v1/teams/leave', {}),
};

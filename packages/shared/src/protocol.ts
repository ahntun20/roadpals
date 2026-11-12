import type { Fix } from './antiCheat';
import type { VehicleType } from './vehicles';

/** Hazard types drivers can report. */
export const HAZARDS = {
  pothole: { icon: '🕳️', label: 'Pothole' },
  police: { icon: '🚓', label: 'Police' },
  crash: { icon: '💥', label: 'Crash' },
  object: { icon: '📦', label: 'Object on road' },
  jam: { icon: '🚦', label: 'Traffic jam' },
} as const;
export type HazardType = keyof typeof HAZARDS;

export interface PublicDriver {
  id: string;
  name: string;
  lat: number;
  lng: number;
  heading: number;
  vehicleType: VehicleType;
  brand: string;
  color: string;
  skin: string;
  passes: number; // times *you* have passed this driver
}

export interface LedgerEntry {
  id: string;
  kind: 'earn' | 'spend' | 'expire' | 'reverse' | 'gift';
  ruleId: string | null;
  icon: string;
  amount: number;
  text: string;
  createdAt: string;
  /** Frequent, low-value awards the app shouldn't toast. */
  quiet?: boolean;
}

export interface HazardDTO {
  id: string;
  type: HazardType;
  lat: number;
  lng: number;
  reporterName: string;
  mine: boolean;
  confirms: number;
  createdAt: string;
}

/** Messages the app sends over the WebSocket. */
export type ClientMsg =
  | { t: 'fix'; fix: Fix }
  | { t: 'wave' }
  | { t: 'ping' };

/** Messages the server sends over the WebSocket. */
export type ServerMsg =
  | { t: 'hello'; userId: string }
  | { t: 'points'; entry: LedgerEntry; lifetime: number; balance: number }
  | { t: 'nearby'; drivers: PublicDriver[] }
  | { t: 'waved'; from: { id: string; name: string; emoji: string }; canWaveBackUntil: number }
  | { t: 'waveResult'; ok: boolean; to?: string; mutual?: boolean; reason?: string }
  | { t: 'hazardPrompt'; hazard: HazardDTO }
  | { t: 'toast'; icon: string; text: string }
  | { t: 'fixRejected'; reason: string }
  | { t: 'pong' };

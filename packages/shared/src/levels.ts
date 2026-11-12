export interface Level { min: number; name: string; icon: string }

export const LEVELS: Level[] = [
  { min: 0, name: 'Rookie', icon: '🐣' },
  { min: 100, name: 'Cruiser', icon: '🚗' },
  { min: 300, name: 'Road Regular', icon: '🛣️' },
  { min: 700, name: 'Wave Captain', icon: '👋' },
  { min: 1500, name: 'Highway Hero', icon: '🦸' },
  { min: 3000, name: 'Road Legend', icon: '👑' },
];

/** Levels use lifetime points, never the spendable balance. */
export function levelFor(lifetime: number): { level: Level; index: number; next: Level | null; progress: number } {
  let index = 0;
  while (index + 1 < LEVELS.length && lifetime >= LEVELS[index + 1].min) index++;
  const level = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  const progress = next ? (lifetime - level.min) / (next.min - level.min) : 1;
  return { level, index, next, progress: Math.max(0, Math.min(1, progress)) };
}

/** Share of the weekly prize by rank (0-based). */
export function weeklyPrizeShare(rank: number): number {
  if (rank === 0) return 1;
  if (rank === 1) return 0.6;
  if (rank === 2) return 0.3;
  if (rank < 10) return 0.1;
  return 0;
}

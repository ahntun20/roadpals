/** Local calendar parts for a timezone, using Intl (works in Node and React Native/Hermes). */
export function localParts(date: Date, timeZone: string): { y: number; m: number; d: number; hour: number; weekday: number } {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  }
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  return { y: +parts.year, m: +parts.month, d: +parts.day, hour: +parts.hour % 24, weekday: wd < 0 ? 0 : wd };
}

/** Days since 1970-01-01 for the user's local calendar date (streaks, daily caps). */
export function localDayIndex(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
}

export function localHour(date: Date, timeZone: string): number {
  return localParts(date, timeZone).hour;
}

export function isRushOrNight(hour: number): boolean {
  return (hour >= 7 && hour < 9) || (hour >= 16 && hour < 19) || hour >= 22 || hour < 5;
}

/** ISO-like week id in UTC, Monday start: "2026-W46". Used for the global weekly leaderboard. */
export function weekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday decides the ISO year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const env = process.env;

function num(name: string, def: number): number {
  const v = env[name];
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

export const config = {
  port: num('PORT', 4000),
  host: env.HOST ?? '0.0.0.0',
  databaseUrl: env.DATABASE_URL ?? 'postgres://roadpals:roadpals@localhost:5432/roadpals',
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-change-me',
  adminToken: env.ADMIN_TOKEN ?? '',
  /** Dev login: the verification code is returned by the API and 000000 always works. Never enable in production. */
  devLogin: (env.DEV_LOGIN ?? (env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true',
  /** Optional OSRM server for routes (e.g. http://localhost:5000). */
  osrmUrl: env.OSRM_URL ?? '',

  nearbyRadiusM: num('NEARBY_RADIUS_M', 1500),
  positionTtlS: num('POSITION_TTL_S', 60),
  maxPassesPerPairPerDay: num('MAX_PASSES_PER_PAIR_PER_DAY', 6),
  waveRangeM: num('WAVE_RANGE_M', 200),
  waveBackWindowMs: num('WAVE_BACK_WINDOW_MS', 5000),
  /** Waving is locked above this speed unless the user is in passenger mode. */
  waveLockSpeedMps: num('WAVE_LOCK_SPEED_MPS', 4),
  convoyRadiusM: num('CONVOY_RADIUS_M', 150),
  hazardPromptRadiusM: num('HAZARD_PROMPT_RADIUS_M', 110),
  checkinRadiusM: num('CHECKIN_RADIUS_M', 45),
  tripArriveRadiusM: num('TRIP_ARRIVE_RADIUS_M', 60),
  couponHoldDays: num('COUPON_HOLD_DAYS', 7),
  pointsExpiryDays: num('POINTS_EXPIRY_DAYS', 365),
  jobIntervalMs: num('JOB_INTERVAL_MS', 60_000),
};

if (env.NODE_ENV === 'production') {
  if (config.jwtSecret === 'dev-only-change-me') throw new Error('Set JWT_SECRET in production');
  if (config.devLogin) throw new Error('DEV_LOGIN must be false in production');
}

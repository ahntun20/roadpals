import { Redis } from 'ioredis';
import { buildApp } from './app';
import { config } from './config';
import { createDb, migrate } from './db';
import { startJobs } from './services/social';

async function main() {
  const db = createDb(config.databaseUrl);
  const applied = await migrate(db);
  // family: 0 = IPv4 or IPv6 (Railway's private network uses IPv6 hostnames).
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, family: 0 });
  const sub = new Redis(config.redisUrl, { family: 0 });
  for (const [name, r] of [['redis', redis], ['redis-sub', sub]] as const) r.on('error', (e) => console.error(`${name}: ${e.message}`));
  const { app, ctx } = await buildApp({ db, redis, sub, logger: true });
  if (applied.length) app.log.info(`applied migrations: ${applied.join(', ')}`);
  const stopJobs = startJobs(ctx, (m) => app.log.info(m));
  await app.listen({ port: config.port, host: config.host });
  if (config.devLogin) app.log.warn('DEV_LOGIN is on: code 000000 signs anyone in. Turn it off in production.');
  if (config.betaLoginCode) app.log.warn('BETA_LOGIN_CODE is set: anyone with that code can sign in. Remove it once SMS is connected.');

  const shutdown = async () => {
    stopJobs();
    await app.close();
    await Promise.all([db.end(), redis.quit(), sub.quit()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { config } from './config';
import { createDb, migrate } from './db';

const db = createDb(config.databaseUrl);
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
await db.end();

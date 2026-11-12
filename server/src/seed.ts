/**
 * Adds sample check-in places around a city centre so you can try check-ins right away.
 * Usage: SEED_LAT=40.758 SEED_LNG=-73.9855 npm run seed -w @roadpals/server
 */
import { offset } from '@roadpals/shared';
import { config } from './config';
import { createDb, migrate } from './db';

const lat = Number(process.env.SEED_LAT ?? 40.758);
const lng = Number(process.env.SEED_LNG ?? -73.9855);
const places: [string, string, number, number][] = [
  ['⛽', 'Corner Gas', 400, 30], ['☕', 'Bean There Café', 650, 120], ['🏛️', 'City Museum', 900, 200],
  ['🗼', 'Old Clock Tower', 1200, 300], ['🍳', 'Sunrise Diner', 500, 250], ['🌳', 'Riverside Park', 1500, 80],
  ['📚', 'Central Library', 800, 330], ['🍦', 'Scoops', 300, 160],
];

const db = createDb(config.databaseUrl);
await migrate(db);
for (const [icon, name, dist, bearing] of places) {
  const p = offset({ lat, lng }, dist, bearing);
  await db.query('INSERT INTO places(name,icon,lat,lng,partner) SELECT $1,$2,$3,$4,true WHERE NOT EXISTS (SELECT 1 FROM places WHERE name=$1)', [name, icon, p.lat, p.lng]);
}
console.log(`Seeded ${places.length} places around ${lat}, ${lng}`);
await db.end();

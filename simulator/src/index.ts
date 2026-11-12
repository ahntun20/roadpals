/**
 * RoadPals traffic simulator: fake drivers that sign up, drive a street grid around a point,
 * stream GPS over the WebSocket, wave back, and report hazards. Run it near your own location
 * to see live traffic in the app.
 *
 *   API_URL=http://localhost:4000 SIM_LAT=40.758 SIM_LNG=-73.9855 SIM_DRIVERS=25 npm run simulate
 *
 * Needs the server running with DEV_LOGIN=true (code 000000 signs bots in).
 */
import WebSocket from 'ws';
import { BRANDS, HAZARDS, offset, type LatLng, type ServerMsg, type VehicleType } from '@roadpals/shared';

const API = process.env.API_URL ?? 'http://localhost:4000';
const CENTER: LatLng = { lat: Number(process.env.SIM_LAT ?? 40.758), lng: Number(process.env.SIM_LNG ?? -73.9855) };
const N = Number(process.env.SIM_DRIVERS ?? 25);
const BLOCK_M = Number(process.env.SIM_BLOCK_M ?? 200); // street spacing
const GRID = Number(process.env.SIM_GRID ?? 8); // streets each way from the centre
const TICK_S = Number(process.env.SIM_TICK_S ?? 3);

const FIRST = ['Mia', 'Leo', 'Ava', 'Kai', 'Zoe', 'Omar', 'Lena', 'Raj', 'Ivy', 'Theo', 'Nora', 'Jae', 'Sam', 'Rosa', 'Eli', 'Maya', 'Ben', 'Tia', 'Hugo', 'Luz', 'Finn', 'Aria', 'Dev', 'June', 'Max', 'Ana', 'Cole', 'Priya', 'Gus', 'Nia'];
const SUF = ['OnMain', 'Drives', 'Rolls', 'GT', 'Cruises', 'Zoom', 'Rides', 'Express', 'Go'];
const SPEED_KMH: Record<VehicleType, number> = { car: 45, taxi: 42, bus: 30, truck: 35, container: 30 };
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** Grid coordinates → lat/lng. Streets run north–south and east–west through the centre. */
const at = (gx: number, gy: number): LatLng => offset(offset(CENTER, gy * BLOCK_M, 0), gx * BLOCK_M, 90);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

interface Bot {
  name: string; phone: string; type: VehicleType; token: string; ws?: WebSocket;
  gx: number; gy: number; dir: readonly [number, number]; t: number; speed: number; friendly: number;
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(json)}`);
  return json as Record<string, unknown>;
}

async function makeBot(i: number): Promise<Bot> {
  const type: VehicleType = i % 6 === 0 ? 'bus' : i % 5 === 0 ? 'taxi' : i % 7 === 0 ? 'truck' : i % 9 === 0 ? 'container' : 'car';
  const name = `${FIRST[i % FIRST.length]}${pick(SUF)}`.slice(0, 24);
  const phone = `+1555${String(9000000 + i).padStart(7, '0')}`;
  let res: Record<string, unknown>;
  try {
    res = await post('/v1/auth/verify', { phone, code: '000000', name, tz: 'UTC', vehicleType: type, vehicleBrand: pick(BRANDS[type]).name });
  } catch (e) {
    throw new Error(`Bot sign-in failed — is the server running with DEV_LOGIN=true? ${(e as Error).message}`);
  }
  const me = res.me as { passengerMode: boolean };
  if (!me.passengerMode) await fetch(`${API}/v1/me`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${res.token}` }, body: JSON.stringify({ passengerMode: true }) });
  const gx = Math.floor(Math.random() * (2 * GRID + 1)) - GRID;
  const gy = Math.floor(Math.random() * (2 * GRID + 1)) - GRID;
  return { name, phone, type, token: res.token as string, gx, gy, dir: pick(DIRS), t: 0, speed: (SPEED_KMH[type] * (0.85 + Math.random() * 0.3)) / 3.6, friendly: 0.3 + Math.random() * 0.6 };
}

function connect(bot: Bot) {
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/v1/ws?token=${bot.token}`);
  bot.ws = ws;
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as ServerMsg;
    if (msg.t === 'waved' && msg.canWaveBackUntil && Math.random() < bot.friendly) {
      setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'wave' })), 600 + Math.random() * 2000);
      console.log(`👋 ${bot.name} waves back at ${msg.from.name}`);
    }
    if (msg.t === 'hazardPrompt') {
      void post(`/v1/hazards/${msg.hazard.id}/vote`, { stillThere: Math.random() < 0.8 }, bot.token).catch(() => {});
    }
  });
  ws.on('close', () => setTimeout(() => connect(bot), 2000));
  ws.on('error', () => {});
}

function step(bot: Bot) {
  bot.t += (bot.speed * TICK_S) / BLOCK_M;
  while (bot.t >= 1) {
    bot.t -= 1;
    bot.gx += bot.dir[0];
    bot.gy += bot.dir[1];
    // At each intersection: mostly straight, sometimes turn, never leave the grid.
    const options = DIRS.filter((d) => !(d[0] === -bot.dir[0] && d[1] === -bot.dir[1]) && Math.abs(bot.gx + d[0]) <= GRID && Math.abs(bot.gy + d[1]) <= GRID);
    const straight = options.find((d) => d === bot.dir);
    bot.dir = straight && Math.random() < 0.6 ? straight : pick(options.length ? options : DIRS);
  }
  const a = at(bot.gx, bot.gy), b = at(bot.gx + bot.dir[0], bot.gy + bot.dir[1]);
  const p = { lat: a.lat + (b.lat - a.lat) * bot.t, lng: a.lng + (b.lng - a.lng) * bot.t };
  const heading = bot.dir[0] === 1 ? 90 : bot.dir[0] === -1 ? 270 : bot.dir[1] === 1 ? 0 : 180;
  return { ...p, heading };
}

async function main() {
  console.log(`Starting ${N} drivers around ${CENTER.lat}, ${CENTER.lng} → ${API}`);
  const bots: Bot[] = [];
  for (let i = 0; i < N; i++) bots.push(await makeBot(i));
  bots.forEach(connect);
  console.log(`Signed in: ${bots.map((b) => b.name).join(', ')}`);

  setInterval(() => {
    for (const bot of bots) {
      if (bot.ws?.readyState !== 1) continue;
      const p = step(bot);
      bot.ws.send(JSON.stringify({ t: 'fix', fix: { lat: p.lat, lng: p.lng, heading: p.heading, speed: bot.speed, accuracy: 5, ts: Date.now() } }));
      if (Math.random() < 0.004) {
        const type = pick(Object.keys(HAZARDS));
        void post('/v1/hazards', { type, lat: p.lat, lng: p.lng }, bot.token).then(() => console.log(`⚠️  ${bot.name} reported ${type}`)).catch(() => {});
      }
      if (Math.random() < Number(process.env.SIM_WAVE_RATE ?? 0.01)) bot.ws.send(JSON.stringify({ t: 'wave' }));
    }
  }, TICK_S * 1000);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

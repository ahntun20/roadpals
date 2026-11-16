# RoadPals

A Waze-style driving app where drivers earn points for driving, passing each other, waving and reporting hazards — and spend them in a rewards shop.

```
roadpals/
├── app/               Expo (React Native) mobile app — iOS + Android
├── server/            Node.js + TypeScript API: Fastify, WebSockets, Postgres, Redis
├── packages/shared/   Rules, levels, shop catalog, vehicles, geo + anti-cheat logic (used by app and server)
└── simulator/         Fake drivers that drive a street grid so you can see live traffic
```

## What it does

**22 point rules** (all editable by an admin without a deploy):

| Category | Rules |
|---|---|
| Driving | km driven (not while speeding) · new area explored · arrived at destination · safe trip · rush-hour & night bonus |
| Meeting drivers | passed a new driver · passed the same driver again · road-buddy bonus · convoy |
| Waving | got waved at · waved at someone (daily cap) · mutual wave |
| Hazards & map | reported a hazard · your report confirmed · verified a report · map edit · place check-in |
| Daily & weekly | daily streak (with streak freezes) · first pass / wave of the day · weekly leaderboard prizes |
| Community | team weekly km challenge · friend invite (paid on their first km) |

**Rewards shop**: car skins, wave styles, map themes, boosts (double points, bigger pass radius, streak freeze, extra waves), gifts, donations and partner coupons. Spending only lowers the *balance*; levels use *lifetime* points, so redeeming never drops a level.

**Vehicles**: cars, taxis, buses, trucks and container trucks, drawn top-down on the map. Every brand has one fixed colour.

**Safety, privacy and fair play**
- Waving is locked while the car is moving unless the user turns on Passenger mode.
- Only drivers within 1.5 km are shown, and they disappear 60 s after they stop sending GPS.
- Anti-cheat rejects mock locations, teleports (>250 km/h), inaccurate fixes and out-of-order timestamps, and keeps a cheat score per user.
- Daily caps on waves, reports, map edits and passes per pair stop farming. "Got waved at" pays once per sender per day. Gifts add only to the balance, not lifetime points.
- Partner coupons unlock after 30 km of verified driving and are held 7 days before the code is shown, so fraud can be reversed first.
- Points expire after 365 days without driving (rolling).

## Quick start (your computer)

You need **Node 22+** and **Docker**.

```bash
git clone https://github.com/ahntun20/roadpals.git
cd roadpals
npm install                 # server, shared, simulator
docker compose up --build   # Postgres + Redis + API on http://localhost:4000
```

In another terminal, add sample places and start 25 fake drivers around a location (use your own lat/lng to see them near you):

```bash
docker compose exec server npx tsx src/seed.ts            # or: SEED_LAT=… SEED_LNG=… npm run seed -w @roadpals/server
SIM_LAT=40.758 SIM_LNG=-73.9855 SIM_DRIVERS=25 npm run simulate
```

### Run the app on your phone

```bash
cd app
npm install
EXPO_PUBLIC_API_URL=http://YOUR-COMPUTER-LAN-IP:4000 npx expo start --go
```

Scan the QR code with **Expo Go**. Sign in with any phone number — in dev mode the code is shown on screen (and `000000` always works).

> Expo Go can't track location in the background, so it tracks only while the app is open (the app tells you this). For background tracking, make a development build: `npx expo run:ios` / `npx expo run:android`, or `npx eas-cli@latest build --profile development`.

### Windows: start everything at once

With Docker Desktop running, in PowerShell from the `roadpals` folder:

```powershell
.\start-windows.ps1 -Lat 40.758 -Lng -73.9855
```

It opens three windows (server, fake drivers near your lat/lng, and the Expo app with your computer's IP already set). Scan the QR code with Expo Go.

## Running the server without Docker

```bash
cp .env.example .env          # then edit
# Postgres 16 and Redis 7 running locally
npm run dev                   # migrates the database and starts on :4000
```

## Tests

```bash
npm test          # shared unit tests + end-to-end server tests (needs Postgres + Redis)
npm run typecheck
cd app && npx tsc --noEmit
```

The server tests sign users up, drive them along streets, and check every rule end to end: km/rush/streak/explore/check-ins, anti-cheat, fast-car passes and repeat passes, invites, real-time waves over WebSockets (including the driving lock and mutual waves), the hazard report → prompt → confirm loop, the shop, team challenges, weekly prizes, and that every balance equals its ledger. They use `TEST_DATABASE_URL` (default `postgres://roadpals:roadpals@localhost:5432/roadpals_test` — **the test wipes this database**) and `TEST_REDIS_URL` (default Redis db 15).

## API

All endpoints are under `/v1`. Send `Authorization: Bearer <token>`.

| Method | Path | What it does |
|---|---|---|
| POST | `/auth/request-code` | Send a 6-digit code to a phone number |
| POST | `/auth/verify` | Sign in / sign up (name, vehicle, brand, invite code) → token |
| GET/PATCH/DELETE | `/me` | Profile, level, balance, boosts, passenger mode; DELETE removes the account and its data |
| GET | `/me/ledger` | Points history |
| GET | `/rules`, `/catalog` | Point rules; shop items, brands and hazard types |
| POST | `/locations` | Batch of GPS fixes (the app's background task uses this) |
| POST | `/stop` | Hide me from the live map |
| POST | `/waves` | Wave at the nearest driver (or wave back) |
| GET/POST | `/hazards`, `/hazards/:id/vote` | Nearby hazards, report one, confirm or mark gone |
| GET | `/places` | Check-in places nearby |
| POST | `/map-edits` | Suggest a road name |
| POST/DELETE | `/trips` | Start or cancel navigation to a destination |
| GET | `/route` | Route via your OSRM server (if `OSRM_URL` is set) |
| POST | `/shop/buy`, `/shop/equip` · GET `/coupons` | Rewards shop |
| GET | `/leaderboard` | This week's ranking |
| GET/POST | `/teams/me`, `/teams`, `/teams/join`, `/teams/leave` | Teams |
| GET | `/privacy` (no `/v1`) | Privacy policy page |
| WS | `/ws?token=…` | Live: nearby drivers, points, waves, hazard prompts; send `fix` and `wave` |

Admin endpoints need the `x-admin-token` header: `PUT /admin/rules` (change points, toggle rules, set parameters), `POST /admin/places`, `GET/POST /admin/map-edits`, `POST /admin/reverse` (remove points earned by cheating).

## How the parts fit

- **GPS → points**: each fix goes through anti-cheat, updates the user's live position in a Redis geo index, credits distance, and checks rules (km, explore, streak, team km, trips, check-ins, hazard prompts, encounters).
- **Passing detection**: for every nearby driver, the server measures the closest approach along your last movement (so two cars crossing at 100 km/h between GPS updates still count) and runs a small state machine per pair: a pass counts once per approach, repeat passes need a time gap, and passes per pair per day are capped.
- **Points ledger**: every change is one row (`earn`, `spend`, `gift`, `expire`, `reverse`). Lifetime = earn + reverse; balance = all rows.
- **Realtime**: WebSocket messages go through Redis pub/sub, so you can run several server instances behind a load balancer.

## Deploy the server to Railway

The repo includes `railway.json`, so Railway builds `server/Dockerfile` and checks `/health` on every deploy.

1. Sign up at railway.com with GitHub. **New Project → Deploy from GitHub repo → `roadpals`**.
2. In the project: **+ Create → Database → PostgreSQL**, then **+ Create → Database → Redis**.
3. Open the `roadpals` service → **Variables** and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` |
   | `PORT` | `4000` |
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | a long random string |
   | `ADMIN_TOKEN` | another long random string |
   | `BETA_LOGIN_CODE` | a secret 6-digit code for testers (until SMS is connected) |

4. **Settings → Networking → Generate Domain** (port 4000). Open `https://<your-domain>/health`.
5. App: `EXPO_PUBLIC_API_URL=https://<your-domain>` then `npx expo start --go --clear` (Expo Go) or `npx expo start --dev-client --clear` (development build). Sign in with any number and the beta code.
6. Optional: sample places and fake drivers against the hosted server:
   ```bash
   API_URL=https://<your-domain> SIM_LOGIN_CODE=<beta code> SIM_LAT=… SIM_LNG=… npm run simulate
   ```

Every push to `main` redeploys automatically.

## Development build (Android): background tracking, own app icon

Expo Go can't track GPS with the screen off. A development build is your own RoadPals app, with live reload from your computer and background tracking. `app/eas.json` has three profiles, all pointing at the Railway server:

| Profile | What you get | Command (in `app/`) |
|---|---|---|
| `development` | RoadPals dev app; loads code from your computer (`npx expo start --dev-client`) | `npm run build:dev` |
| `preview` | Standalone test app for friends — no computer needed | `npm run build:preview` |
| `production` | Play Store bundle (`.aab`) | `npm run build:prod` |

One-time setup:

1. Google Maps key for Android (without it the map is blank in builds; Expo Go has its own): in Google Cloud Console create a project, enable **Maps SDK for Android**, create an API key and restrict it to Android apps with package `com.roadpals.app`. Then store it on EAS:
   ```bash
   cd app
   npx eas-cli@latest login
   npx eas-cli@latest env:create --name GOOGLE_MAPS_API_KEY --value AIza... --visibility sensitive
   # when asked, pick all environments (development, preview, production)
   ```
2. Build: `npm run build:dev` (first build takes ~10–20 min in Expo's cloud). Open the link it prints on your phone and install the `.apk` (allow "install unknown apps" for your browser).
3. Run: `npx expo start --dev-client --tunnel` on your computer, then open RoadPals on the phone.

After installing `expo-dev-client`, plain `npx expo start` targets the development build. Use `npx expo start --go` for Expo Go.

## Real SMS sign-in (Twilio Verify)

1. Create a Twilio account, then **Verify → Services → Create** (any name, e.g. RoadPals).
2. On Railway, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (from the Twilio console home) and `TWILIO_VERIFY_SERVICE_SID` (starts with `VA`).
3. Redeploy. The log says `SMS sign-in: Twilio Verify`. Phone numbers must include the country code (`+1…`).
4. Once real sign-in works, remove `BETA_LOGIN_CODE`.

Twilio charges per verification; set a spending limit in its console.

## Privacy and account deletion

- Privacy policy: `https://<your-domain>/privacy` (set `PRIVACY_CONTACT_EMAIL` on Railway). It describes what the code does; have it reviewed before launch. Use this URL in the store listings.
- Users delete their account in **Me → Delete account**. `DELETE /v1/me` removes the user, their ledger, passes, inventory, coupons and live data; their hazard reports stay without their name, and old tokens stop working immediately.

## Going to production — checklist

- [ ] Set `NODE_ENV=production`, a long random `JWT_SECRET`, `ADMIN_TOKEN`, and `DEV_LOGIN=false`. Remove `BETA_LOGIN_CODE` once SMS works.
- [ ] Turn on real SMS: set the three `TWILIO_*` variables (see above), then remove `BETA_LOGIN_CODE`.
- [ ] Use managed Postgres and Redis with backups.
- [ ] Android: add a Google Maps API key (`GOOGLE_MAPS_API_KEY`, see `app/app.json`).
- [ ] Set real bundle IDs in `app/app.json`, then build with EAS and submit to the stores. Both stores review background location closely: explain in the listing and the permission text why you need it.
- [ ] Optional: speed limits from OpenStreetMap via your map-matching service (`setSpeedLimitProvider` in `server/src/services/location.ts`) — until then no km counts as speeding.
- [ ] Optional: self-host OSRM for routes (`OSRM_URL`).
- [ ] Privacy policy and data deletion (location data is sensitive; follow GDPR/CCPA).
- [ ] With more than one server instance, keep each user's WebSocket and fixes on one instance (sticky sessions), or swap the in-process locks in `server/src/util.ts` for Redis locks.

## Known limits

- "New area explored" uses ~150 m map cells, not real road segments. Real segments need map matching (OSRM/Valhalla).
- Partner coupons are generated codes; connect a partner API before giving out real rewards.

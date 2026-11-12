-- RoadPals schema. Plain Postgres (no extensions needed); live positions live in Redis.

CREATE TABLE IF NOT EXISTS teams (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  phone           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  tz              TEXT NOT NULL DEFAULT 'UTC',
  vehicle_type    TEXT NOT NULL DEFAULT 'car',
  vehicle_brand   TEXT NOT NULL DEFAULT 'Other',
  passenger_mode  BOOLEAN NOT NULL DEFAULT false,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  balance         INTEGER NOT NULL DEFAULT 0,
  odo_m           DOUBLE PRECISION NOT NULL DEFAULT 0,
  legal_m         DOUBLE PRECISION NOT NULL DEFAULT 0,
  km_awarded      INTEGER NOT NULL DEFAULT 0,
  explored_cells  INTEGER NOT NULL DEFAULT 0,
  streak          INTEGER NOT NULL DEFAULT 0,
  streak_day      INTEGER NOT NULL DEFAULT -2,
  freezes         INTEGER NOT NULL DEFAULT 0,
  equipped_skin   TEXT NOT NULL DEFAULT 'skin:classic',
  equipped_wave   TEXT NOT NULL DEFAULT 'wave:hand',
  equipped_theme  TEXT NOT NULL DEFAULT 'theme:day',
  team_id         BIGINT REFERENCES teams(id) ON DELETE SET NULL,
  invite_code     TEXT NOT NULL UNIQUE,
  invited_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  invite_rewarded BOOLEAN NOT NULL DEFAULT false,
  cheat_score     INTEGER NOT NULL DEFAULT 0,
  active_trip     JSONB,
  last_drive_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_team_idx ON users(team_id);

-- Every change to a user's points is one row. lifetime = earn + reverse; balance = all rows.
CREATE TABLE IF NOT EXISTS points_ledger (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('earn','spend','expire','reverse','gift')),
  rule_id     TEXT,
  amount      INTEGER NOT NULL,
  text        TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON points_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS encounters (
  user_a      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  passes      INTEGER NOT NULL DEFAULT 0,
  last_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS hazards (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  confirms    INTEGER NOT NULL DEFAULT 0,
  gone_votes  INTEGER NOT NULL DEFAULT 0,
  removed     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS hazards_geo_idx ON hazards(lat, lng) WHERE NOT removed;

CREATE TABLE IF NOT EXISTS hazard_votes (
  hazard_id   BIGINT NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  still_there BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hazard_id, user_id)
);

CREATE TABLE IF NOT EXISTS places (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '📍',
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  partner     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS places_geo_idx ON places(lat, lng);

CREATE TABLE IF NOT EXISTS checkins (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id    BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  day         INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, place_id, day)
);

CREATE TABLE IF NOT EXISTS map_edits (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  kind        TEXT NOT NULL,
  value       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','used','void')),
  ready_at    TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS donations (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weekly_payouts (
  week        TEXT PRIMARY KEY,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_weeks (
  team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week        TEXT NOT NULL,
  km          DOUBLE PRECISION NOT NULL DEFAULT 0,
  rewarded    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (team_id, week)
);

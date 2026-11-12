import { weekId, type LedgerEntry, type RuleId } from '@roadpals/shared';
import type { Ctx } from '../ctx';
import type { Q } from '../db';

export class InsufficientBalance extends Error {
  constructor() { super('Not enough points'); }
}

export const keys = {
  leaderboard: (week: string) => `lb:${week}`,
  doubleBoost: (uid: string) => `boost:double:${uid}`,
  radiusBoost: (uid: string) => `boost:radius:${uid}`,
};

function toEntry(row: { id: string; kind: LedgerEntry['kind']; rule_id: string | null; amount: number; text: string; created_at: Date; meta?: { icon?: string } }, icon: string): LedgerEntry {
  return { id: String(row.id), kind: row.kind, ruleId: row.rule_id, icon, amount: row.amount, text: row.text, createdAt: new Date(row.created_at).toISOString() };
}

export interface AwardOpts {
  mult?: number;
  meta?: Record<string, unknown>;
  /** Run inside an existing transaction. */
  q?: Q;
  /** Weekly prizes don't count toward next week's ranking. */
  skipLeaderboard?: boolean;
  /** Ask the app not to show a toast (e.g. "new area explored" fires often). */
  quiet?: boolean;
}

/**
 * Award points for a rule. Applies the enabled flag and the user's double-points boost,
 * writes one ledger row, updates lifetime + balance, bumps the weekly leaderboard and
 * notifies the user's devices. Returns the amount awarded (0 if the rule is off).
 */
export async function award(ctx: Ctx, userId: string, ruleId: RuleId, text: string, opts: AwardOpts = {}): Promise<number> {
  const rule = ctx.rules()[ruleId];
  if (!rule.enabled || rule.points <= 0) return 0;
  let mult = opts.mult ?? 1;
  if (ruleId !== 'weekly' && (await ctx.redis.exists(keys.doubleBoost(userId)))) {
    mult *= 2;
    text += ' (2×)';
  }
  const amount = Math.round(rule.points * mult);
  if (amount <= 0) return 0;
  const q = opts.q ?? ctx.db;
  const meta = { ...(opts.meta ?? {}), icon: rule.icon, quiet: !!opts.quiet };
  const ins = await q.query(
    `WITH l AS (INSERT INTO points_ledger(user_id,kind,rule_id,amount,text,meta) VALUES ($1,'earn',$2,$3,$4,$5) RETURNING *),
          u AS (UPDATE users SET lifetime_points=lifetime_points+$3, balance=balance+$3 WHERE id=$1 RETURNING lifetime_points, balance)
     SELECT l.*, u.lifetime_points, u.balance FROM l, u`,
    [userId, ruleId, amount, text, JSON.stringify(meta)],
  );
  const row = ins.rows[0];
  if (!row) return 0;
  if (!opts.skipLeaderboard) await ctx.redis.zincrby(keys.leaderboard(weekId(new Date(ctx.now()))), amount, userId);
  ctx.send(userId, { t: 'points', entry: { ...toEntry(row, rule.icon), quiet: !!opts.quiet }, lifetime: row.lifetime_points, balance: row.balance });
  return amount;
}

/** Spend from the balance (never touches lifetime points or levels). Throws InsufficientBalance. */
export async function spend(ctx: Ctx, q: Q, userId: string, amount: number, text: string, icon: string, meta: Record<string, unknown> = {}): Promise<{ balance: number; lifetime: number }> {
  const u = await q.query('SELECT balance, lifetime_points FROM users WHERE id=$1 FOR UPDATE', [userId]);
  if (!u.rowCount || u.rows[0].balance < amount) throw new InsufficientBalance();
  const ins = await q.query(
    "INSERT INTO points_ledger(user_id,kind,rule_id,amount,text,meta) VALUES ($1,'spend',NULL,$2,$3,$4) RETURNING *",
    [userId, -amount, text, JSON.stringify({ ...meta, icon })],
  );
  const up = await q.query('UPDATE users SET balance=balance-$2 WHERE id=$1 RETURNING balance, lifetime_points', [userId, amount]);
  ctx.send(userId, { t: 'points', entry: toEntry(ins.rows[0], icon), lifetime: up.rows[0].lifetime_points, balance: up.rows[0].balance });
  return { balance: up.rows[0].balance, lifetime: up.rows[0].lifetime_points };
}

/** Balance-only credit (gifts). Doesn't raise lifetime points, so friends can't farm levels. */
export async function credit(ctx: Ctx, q: Q, userId: string, amount: number, text: string, icon: string, meta: Record<string, unknown> = {}): Promise<void> {
  const ins = await q.query(
    "INSERT INTO points_ledger(user_id,kind,rule_id,amount,text,meta) VALUES ($1,'gift',NULL,$2,$3,$4) RETURNING *",
    [userId, amount, text, JSON.stringify({ ...meta, icon })],
  );
  const up = await q.query('UPDATE users SET balance=balance+$2 WHERE id=$1 RETURNING balance, lifetime_points', [userId, amount]);
  ctx.send(userId, { t: 'points', entry: toEntry(ins.rows[0], icon), lifetime: up.rows[0].lifetime_points, balance: up.rows[0].balance });
}

/** Remove points earned through cheating: lowers both balance and lifetime. */
export async function reverse(ctx: Ctx, userId: string, amount: number, reason: string): Promise<void> {
  await ctx.db.query(
    `WITH l AS (INSERT INTO points_ledger(user_id,kind,rule_id,amount,text,meta) VALUES ($1,'reverse',NULL,$2,$3,'{"icon":"🚫"}'))
     UPDATE users SET lifetime_points=GREATEST(0,lifetime_points-$4), balance=GREATEST(0,balance-$4) WHERE id=$1`,
    [userId, -amount, reason, amount],
  );
}

export async function history(ctx: Ctx, userId: string, limit = 50): Promise<LedgerEntry[]> {
  const r = await ctx.db.query('SELECT * FROM points_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT $2', [userId, Math.min(200, limit)]);
  return r.rows.map((row) => toEntry(row, row.meta?.icon ?? '•'));
}

import { COSMETIC_KINDS, localDayIndex, shopItem, SHOP_ITEMS } from '@roadpals/shared';
import type { Ctx } from '../ctx';
import { config } from '../config';
import { tx } from '../db';
import { code } from '../util';
import { credit, keys, spend } from './ledger';
import { dailyKey } from './location';
import { getUser, refreshProfile } from './users';

export class ShopError extends Error {}

const equipColumn = { skin: 'equipped_skin', wave: 'equipped_wave', theme: 'equipped_theme' } as const;

export async function equip(ctx: Ctx, uid: string, itemId: string): Promise<void> {
  const item = shopItem(itemId);
  if (!item || !COSMETIC_KINDS.includes(item.kind)) throw new ShopError('Not an equippable item');
  if (item.cost > 0) {
    const own = await ctx.db.query('SELECT 1 FROM inventory WHERE user_id=$1 AND item_id=$2', [uid, itemId]);
    if (!own.rowCount) throw new ShopError('You don’t own this yet');
  }
  const col = equipColumn[item.kind as keyof typeof equipColumn];
  await ctx.db.query(`UPDATE users SET ${col}=$2 WHERE id=$1`, [uid, itemId]);
  const u = await getUser(ctx, uid);
  if (u) await refreshProfile(ctx, u);
}

export interface BuyResult { ok: true; message: string; coupon?: { code: string; readyAt: string } }

/** Buy or redeem an item. Every purchase is a "spend" ledger row; lifetime points never drop. */
export async function buy(ctx: Ctx, uid: string, itemId: string, opts: { giftTo?: string } = {}): Promise<BuyResult> {
  const item = shopItem(itemId);
  if (!item) throw new ShopError('Unknown item');
  const user = await getUser(ctx, uid);
  if (!user) throw new ShopError('No user');

  if (COSMETIC_KINDS.includes(item.kind)) {
    const own = await ctx.db.query('SELECT 1 FROM inventory WHERE user_id=$1 AND item_id=$2', [uid, itemId]);
    if (item.cost > 0 && !own.rowCount) {
      await tx(ctx.db, async (c) => {
        await spend(ctx, c, uid, item.cost, `Redeemed: ${item.name}`, item.icon, { itemId });
        await c.query('INSERT INTO inventory(user_id,item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, itemId]);
      });
    }
    await equip(ctx, uid, itemId);
    return { ok: true, message: `${item.name} equipped` };
  }

  if (item.minKm && user.legal_m / 1000 < item.minKm) throw new ShopError(`Drive ${item.minKm} km to unlock partner rewards`);

  switch (item.id) {
    case 'boost:double':
    case 'boost:radius': {
      const key = item.id === 'boost:double' ? keys.doubleBoost(uid) : keys.radiusBoost(uid);
      const add = item.id === 'boost:double' ? 3600_000 : 86400_000;
      await tx(ctx.db, (c) => spend(ctx, c, uid, item.cost, `Redeemed: ${item.name}`, item.icon, { itemId }));
      const left = Math.max(0, await ctx.redis.pttl(key));
      await ctx.redis.set(key, '1', 'PX', left + add);
      return { ok: true, message: `${item.name} active` };
    }
    case 'boost:freeze':
      await tx(ctx.db, async (c) => {
        await spend(ctx, c, uid, item.cost, `Redeemed: ${item.name}`, item.icon, { itemId });
        await c.query('UPDATE users SET freezes=freezes+1 WHERE id=$1', [uid]);
      });
      return { ok: true, message: 'Streak freeze saved for a missed day' };
    case 'boost:waves': {
      await tx(ctx.db, (c) => spend(ctx, c, uid, item.cost, `Redeemed: ${item.name}`, item.icon, { itemId }));
      const dk = dailyKey(uid, localDayIndex(new Date(ctx.now()), user.tz));
      await ctx.redis.hincrby(dk, 'extraWaves', 10);
      await ctx.redis.expire(dk, 3 * 86400);
      return { ok: true, message: '+10 paid waves today' };
    }
  }

  if (item.kind === 'gift') {
    // Gifts only go to drivers you've actually passed, and only add to their balance.
    const target = opts.giftTo
      ? await ctx.db.query('SELECT CASE WHEN user_a=$1 THEN user_b ELSE user_a END AS id, passes FROM encounters WHERE (user_a=$1 AND user_b=$2) OR (user_a=$2 AND user_b=$1)', [uid, opts.giftTo])
      : await ctx.db.query('SELECT CASE WHEN user_a=$1 THEN user_b ELSE user_a END AS id, passes FROM encounters WHERE user_a=$1 OR user_b=$1 ORDER BY passes DESC LIMIT 1', [uid]);
    if (!target.rowCount) throw new ShopError('You can only gift drivers you’ve passed');
    const to = String(target.rows[0].id);
    const amount = 50;
    await tx(ctx.db, async (c) => {
      await spend(ctx, c, uid, item.cost, `Gift to a road buddy`, item.icon, { itemId, to });
      await credit(ctx, c, to, amount, `${user.name} sent you a gift`, '🎁', { from: uid });
    });
    return { ok: true, message: 'Gift sent' };
  }

  if (item.kind === 'donate') {
    await tx(ctx.db, async (c) => {
      await spend(ctx, c, uid, item.cost, 'Donated to the road repair fund', item.icon, { itemId });
      await c.query('INSERT INTO donations(user_id,amount) VALUES ($1,$2)', [uid, item.cost]);
    });
    return { ok: true, message: 'Thanks for donating!' };
  }

  if (item.kind === 'coupon') {
    // Real-world rewards are held for a few days so fraud can be reversed before they're used.
    const c0 = `RP-${code(8)}`;
    const readyAt = new Date(ctx.now() + config.couponHoldDays * 86400_000);
    await tx(ctx.db, async (c) => {
      await spend(ctx, c, uid, item.cost, `Redeemed: ${item.name}`, item.icon, { itemId });
      await c.query('INSERT INTO coupons(user_id,item_id,code,ready_at) VALUES ($1,$2,$3,$4)', [uid, itemId, c0, readyAt]);
    });
    return { ok: true, message: `Coupon ready on ${readyAt.toDateString()}`, coupon: { code: c0, readyAt: readyAt.toISOString() } };
  }

  throw new ShopError('This item can’t be bought');
}

export async function coupons(ctx: Ctx, uid: string) {
  const r = await ctx.db.query('SELECT * FROM coupons WHERE user_id=$1 ORDER BY id DESC', [uid]);
  return r.rows.map((c) => ({
    id: String(c.id),
    itemId: c.item_id,
    name: shopItem(c.item_id)?.name ?? c.item_id,
    // Only reveal the code once the holding period is over.
    code: new Date(c.ready_at).getTime() <= ctx.now() && c.status !== 'void' ? c.code : null,
    status: c.status === 'pending' && new Date(c.ready_at).getTime() <= ctx.now() ? 'ready' : c.status,
    readyAt: new Date(c.ready_at).toISOString(),
  }));
}

export const catalog = () => SHOP_ITEMS;

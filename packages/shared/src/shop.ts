export type ShopKind = 'skin' | 'wave' | 'theme' | 'boost' | 'gift' | 'donate' | 'coupon';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  section: string;
  icon: string;
  name: string;
  description: string;
  cost: number;
  /** Real-world rewards unlock only after this many verified km (fraud control). */
  minKm?: number;
  /** Cosmetic value: a colour for skins, an emoji for waves, a theme key for themes. */
  value?: string;
}

export const DEFAULT_EQUIPPED = { skin: 'skin:classic', wave: 'wave:hand', theme: 'theme:day' } as const;

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'skin:classic', kind: 'skin', section: 'Car skins', icon: '🟦', name: 'Brand colour', description: 'Your car’s own brand colour', cost: 0 },
  { id: 'skin:red', kind: 'skin', section: 'Car skins', icon: '🟥', name: 'Red Racer', description: 'Bright red paint', cost: 300, value: '#ef4444' },
  { id: 'skin:stripes', kind: 'skin', section: 'Car skins', icon: '🏁', name: 'Racing Stripes', description: 'Blue with white stripes', cost: 800, value: '#2563eb' },
  { id: 'skin:midnight', kind: 'skin', section: 'Car skins', icon: '⬛', name: 'Midnight', description: 'Black with yellow stripes', cost: 600, value: '#111827' },
  { id: 'skin:rainbow', kind: 'skin', section: 'Car skins', icon: '🌈', name: 'Rainbow', description: 'Full-colour fade', cost: 1200, value: '#a855f7' },
  { id: 'skin:gold', kind: 'skin', section: 'Car skins', icon: '🥇', name: 'Gold Edition', description: 'For true road legends', cost: 1500, value: '#d4a017' },

  { id: 'wave:hand', kind: 'wave', section: 'Wave styles', icon: '👋', name: 'Classic wave', description: 'The original', cost: 0, value: '👋' },
  { id: 'wave:shaka', kind: 'wave', section: 'Wave styles', icon: '🤙', name: 'Shaka', description: 'Hang loose', cost: 200, value: '🤙' },
  { id: 'wave:peace', kind: 'wave', section: 'Wave styles', icon: '✌️', name: 'Peace', description: 'Good vibes only', cost: 200, value: '✌️' },
  { id: 'wave:salute', kind: 'wave', section: 'Wave styles', icon: '🫡', name: 'Salute', description: 'Respect the road', cost: 400, value: '🫡' },
  { id: 'wave:heart', kind: 'wave', section: 'Wave styles', icon: '❤️', name: 'Heart', description: 'Spread the love', cost: 600, value: '❤️' },
  { id: 'wave:party', kind: 'wave', section: 'Wave styles', icon: '🎉', name: 'Party', description: 'Every wave is a celebration', cost: 800, value: '🎉' },

  { id: 'theme:day', kind: 'theme', section: 'Map themes', icon: '☀️', name: 'Day', description: 'Default map', cost: 0, value: 'day' },
  { id: 'theme:night', kind: 'theme', section: 'Map themes', icon: '🌙', name: 'Night', description: 'Easy on the eyes', cost: 500, value: 'night' },
  { id: 'theme:retro', kind: 'theme', section: 'Map themes', icon: '📜', name: 'Retro', description: 'Old paper map', cost: 700, value: 'retro' },

  { id: 'boost:double', kind: 'boost', section: 'Boosts', icon: '⚡', name: 'Double points', description: 'All points ×2 for 1 hour', cost: 400 },
  { id: 'boost:radius', kind: 'boost', section: 'Boosts', icon: '📡', name: 'Bigger pass radius', description: 'Pass radius ×2 for 24 hours', cost: 300 },
  { id: 'boost:freeze', kind: 'boost', section: 'Boosts', icon: '🧊', name: 'Streak freeze', description: 'Saves your streak if you miss a day', cost: 250 },
  { id: 'boost:waves', kind: 'boost', section: 'Boosts', icon: '🙋', name: '+10 waves today', description: 'Raise today’s paid-wave cap', cost: 150 },

  { id: 'gift:50', kind: 'gift', section: 'Social & giving', icon: '🎁', name: 'Gift 50 pts', description: 'To a driver you’ve passed', cost: 50 },
  { id: 'donate:500', kind: 'donate', section: 'Social & giving', icon: '🛠️', name: 'Road repair fund', description: 'Donate 500 pts to fix local potholes', cost: 500 },

  { id: 'coupon:coffee', kind: 'coupon', section: 'Partner rewards', icon: '☕', name: 'Free coffee', description: 'Partner café · unlocks at 30 km', cost: 2000, minKm: 30 },
  { id: 'coupon:fuel', kind: 'coupon', section: 'Partner rewards', icon: '⛽', name: '$2 off fuel', description: 'Partner station · unlocks at 30 km', cost: 5000, minKm: 30 },
];

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export const COSMETIC_KINDS: ShopKind[] = ['skin', 'wave', 'theme'];

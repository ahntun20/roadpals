/**
 * Point rules. The server reads these defaults on first start and stores them
 * in the database, where an admin can change them without a deploy.
 */
export type RuleId =
  | 'km' | 'explore' | 'trip' | 'safe' | 'rush'
  | 'newface' | 'sameagain' | 'buddy' | 'convoy'
  | 'wavedAt' | 'waveSent' | 'mutual'
  | 'report' | 'confirmed' | 'vote' | 'mapedit' | 'checkin'
  | 'streak' | 'firstday' | 'weekly'
  | 'team' | 'invite';

export type RuleCategory = 'Driving' | 'Meeting drivers' | 'Waving' | 'Hazards & map' | 'Daily & weekly' | 'Community';

export interface RuleParam {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
}

export interface RuleDef {
  id: RuleId;
  category: RuleCategory;
  icon: string;
  name: string;
  description: string;
  points: number;
  enabled: boolean;
  param?: RuleParam;
}

export type RuleSet = Record<RuleId, RuleDef>;

const list: RuleDef[] = [
  { id: 'km', category: 'Driving', icon: '🛣️', name: 'Distance driven', description: 'Every km at or under the speed limit (speeding km earn nothing)', points: 2, enabled: true },
  { id: 'explore', category: 'Driving', icon: '🧭', name: 'New area explored', description: 'First time you drive through a ~150 m map cell', points: 1, enabled: true },
  { id: 'trip', category: 'Driving', icon: '🏁', name: 'Arrived at destination', description: 'Finish a navigated trip longer than 500 m', points: 10, enabled: true },
  { id: 'safe', category: 'Driving', icon: '🛡️', name: 'Safe trip', description: 'Finish a navigated trip without speeding', points: 8, enabled: true },
  { id: 'rush', category: 'Driving', icon: '⏰', name: 'Rush hour & night bonus', description: 'Extra per km driven 7–9 AM, 4–7 PM and 10 PM–5 AM (your local time)', points: 2, enabled: true },
  { id: 'newface', category: 'Meeting drivers', icon: '🙂', name: 'Passed a new driver', description: 'Cross paths with someone for the first time', points: 1, enabled: true, param: { key: 'radiusM', label: 'Pass radius (m)', value: 60, min: 20, max: 300 } },
  { id: 'sameagain', category: 'Meeting drivers', icon: '🔁', name: 'Passed the same driver again', description: 'Each repeat encounter with someone you’ve passed before', points: 3, enabled: true, param: { key: 'gapMin', label: 'Min gap between passes (min)', value: 2, min: 0, max: 1440 } },
  { id: 'buddy', category: 'Meeting drivers', icon: '🤝', name: 'Road buddy bonus', description: 'One-time bonus at N passes with the same driver', points: 15, enabled: true, param: { key: 'passes', label: 'Passes needed', value: 5, min: 2, max: 100 } },
  { id: 'convoy', category: 'Meeting drivers', icon: '🚚', name: 'Convoy', description: 'Drive within 150 m of the same driver for a distance (once per driver per day)', points: 10, enabled: true, param: { key: 'distanceM', label: 'Distance together (m)', value: 500, min: 100, max: 20000 } },
  { id: 'wavedAt', category: 'Waving', icon: '👋', name: 'Got waved at', description: 'Another driver waves at you (once per driver per day)', points: 4, enabled: true },
  { id: 'waveSent', category: 'Waving', icon: '🙋', name: 'Waved at someone', description: 'You wave at a driver within 200 m', points: 1, enabled: true, param: { key: 'dailyCap', label: 'Daily cap', value: 20, min: 0, max: 500 } },
  { id: 'mutual', category: 'Waving', icon: '🙌', name: 'Mutual wave', description: 'You both waved within 5 seconds', points: 6, enabled: true },
  { id: 'report', category: 'Hazards & map', icon: '⚠️', name: 'Reported a hazard', description: 'Pothole, police, crash, object or jam', points: 5, enabled: true, param: { key: 'dailyCap', label: 'Paid reports per day', value: 10, min: 0, max: 100 } },
  { id: 'confirmed', category: 'Hazards & map', icon: '✅', name: 'Your report confirmed', description: 'Each driver who confirms your report', points: 3, enabled: true, param: { key: 'maxPaid', label: 'Max confirmations paid', value: 3, min: 0, max: 100 } },
  { id: 'vote', category: 'Hazards & map', icon: '👍', name: 'Verified someone’s report', description: 'Answer “still there?” as you pass a hazard', points: 2, enabled: true },
  { id: 'mapedit', category: 'Hazards & map', icon: '✏️', name: 'Map edit', description: 'Suggest a road name or fix (paid per edit, up to 5 a day)', points: 8, enabled: true, param: { key: 'dailyCap', label: 'Paid edits per day', value: 5, min: 0, max: 100 } },
  { id: 'checkin', category: 'Hazards & map', icon: '📍', name: 'Place check-in', description: 'Drive past a partner place (once per place per day)', points: 3, enabled: true },
  { id: 'streak', category: 'Daily & weekly', icon: '🔥', name: 'Daily streak', description: 'Drive 1 km on a new day; points × days in a row', points: 5, enabled: true, param: { key: 'maxMult', label: 'Max multiplier', value: 7, min: 1, max: 60 } },
  { id: 'firstday', category: 'Daily & weekly', icon: '🌅', name: 'First of the day', description: 'Your first pass and your first wave each day', points: 5, enabled: true },
  { id: 'weekly', category: 'Daily & weekly', icon: '🥇', name: 'Weekly leaderboard prize', description: 'Week end: 1st full, 2nd 60%, 3rd 30%, 4th–10th 10%', points: 100, enabled: true },
  { id: 'team', category: 'Community', icon: '🏆', name: 'Team challenge', description: 'Your team reaches its weekly km goal', points: 50, enabled: true, param: { key: 'goalKm', label: 'Team goal (km)', value: 400, min: 10, max: 100000 } },
  { id: 'invite', category: 'Community', icon: '💌', name: 'Friend invite', description: 'A friend you invited drives their first km', points: 20, enabled: true },
];

export const RULE_IDS = list.map((r) => r.id) as RuleId[];

export function defaultRules(): RuleSet {
  const out = {} as RuleSet;
  for (const r of list) out[r.id] = { ...r, param: r.param ? { ...r.param } : undefined };
  return out;
}

/** Merge a stored (possibly partial / older) rule set over the defaults, clamping params. */
export function mergeRules(stored: Partial<Record<RuleId, Partial<RuleDef>>> | null | undefined): RuleSet {
  const base = defaultRules();
  if (!stored) return base;
  for (const id of RULE_IDS) {
    const s = stored[id];
    if (!s) continue;
    const r = base[id];
    if (typeof s.points === 'number' && s.points >= 0) r.points = Math.round(s.points);
    if (typeof s.enabled === 'boolean') r.enabled = s.enabled;
    if (r.param && s.param && typeof s.param.value === 'number') {
      r.param.value = Math.min(r.param.max, Math.max(r.param.min, s.param.value));
    }
  }
  return base;
}

export function param(rules: RuleSet, id: RuleId): number {
  const p = rules[id].param;
  if (!p) throw new Error(`Rule ${id} has no parameter`);
  return p.value;
}

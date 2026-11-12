import { mergeRules, type RuleSet } from '@roadpals/shared';
import type { Db } from './db';

/** Rules live in the settings table so admins can change points without a deploy. */
export class RulesStore {
  private current: RuleSet = mergeRules(null);
  constructor(private db: Db) {}

  get = (): RuleSet => this.current;

  async load(): Promise<RuleSet> {
    const r = await this.db.query("SELECT value FROM settings WHERE key='rules'");
    this.current = mergeRules(r.rows[0]?.value ?? null);
    if (!r.rowCount) await this.save(this.current);
    return this.current;
  }

  async save(next: unknown): Promise<RuleSet> {
    const merged = mergeRules(next as never);
    await this.db.query(
      "INSERT INTO settings(key,value,updated_at) VALUES ('rules',$1,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()",
      [JSON.stringify(merged)],
    );
    this.current = merged;
    return merged;
  }
}

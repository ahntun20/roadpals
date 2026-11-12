import type { Redis } from 'ioredis';
import type { RuleSet, ServerMsg } from '@roadpals/shared';
import type { Db } from './db';

/** Everything a service needs, passed explicitly so tests can build their own. */
export interface Ctx {
  db: Db;
  redis: Redis;
  rules: () => RuleSet;
  /** Deliver a message to every connected device of a user (across server instances). */
  send: (userId: string, msg: ServerMsg) => void;
  now: () => number;
}

import { createHash, randomUUID } from 'node:crypto';

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Stable JSON (sorted keys) so hashes are reproducible. */
export function canonicalJson(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k]))
      .join(',') +
    '}'
  );
}

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o as object)) {
      deepFreeze((o as Record<string, unknown>)[k]);
    }
  }
  return o;
}

export const newId = (prefix: string): string =>
  `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

export const clone = <T>(v: T): T => structuredClone(v);
export const iso = (d: Date): string => d.toISOString();
export const addMinutes = (d: Date, m: number): Date => new Date(d.getTime() + m * 60_000);
export const addHours = (d: Date, h: number): Date => addMinutes(d, h * 60);
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Raised when something tries to exceed the authority it has been granted. */
export class AuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorityError';
  }
}

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(message: string, problems: string[]) {
    super(`${message}\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

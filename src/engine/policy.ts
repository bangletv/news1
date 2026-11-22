// Editable collection policy: priorities, exclusions, classification and geo-tagging.
// All behaviour comes from config/policy.json. Rules only MATCH and LABEL publisher headlines;
// they never produce or rewrite text.

import { readFile } from 'node:fs/promises';
import {
  CONTINENTS,
  PILLARS,
  SOURCE_CLASSES,
  type Continent,
  type Pillar,
  type Source,
  type SourceEndpoint,
} from './types.ts';
import { isKnownCountry, continentOf } from './geo.ts';
import { compileKeyword, normalizeForMatch } from './text.ts';
import { ConfigError } from './util.ts';

export interface TopicConfig {
  id: string;
  label: string;
  pillar: Pillar;
  weight: number;
  keywords: string[];
}

export interface ExclusionConfig {
  id: string;
  label: string;
  severity: 'hard' | 'soft';
  patterns?: string[];
  sourceFlags?: string[];
}

export interface PlaceConfig {
  names: string[];
  country?: string;
  continent?: Continent;
}

export interface IntegrityConfig {
  maxRedirects: number;
  maxPageBytes: number;
  matchThreshold: number;
  mismatchThreshold: number;
  definitiveStatuses: number[];
  suspendAfterConsecutiveFailures: number;
  ambiguousChecksBeforeSuspend: number;
  restoreAfterConsecutiveOk: number;
  removeAfterDaysSuspended: number;
  recheckHours: { verified: number; unverifiable: number; suspended: number };
  recheckMinutes: { under_watch: number };
  softNotFoundPhrases: string[];
}

export interface PolicyConfig {
  version: number;
  url: { trackingParams: string[]; trackingPrefixes: string[] };
  pillars: Record<Pillar, string>;
  topics: TopicConfig[];
  exclusions: ExclusionConfig[];
  publicInterest: { exemptMaxTrustTier: number; note?: string };
  publishing: {
    allowHttp: boolean;
    headlineMinChars: number;
    headlineMaxChars: number;
    allowMissingDate: boolean;
    maxFutureHours: number;
    maxAgeDays: number;
    maxAgeDaysBySourceClass: Partial<Record<(typeof SOURCE_CLASSES)[number], number>>;
    requireClassification: boolean;
  };
  dedupe: {
    sameSourceTitleWindowHours: number;
    crossSource: 'allow' | 'suppress';
    nearDuplicateThreshold: number;
    nearDuplicateWindowHours: number;
  };
  limits: {
    maxItemsPerEndpointPerRun: number;
    maxPublishedPerSourcePerDay: number;
    fetchTimeoutMs: number;
    minIntervalMsPerHost: number;
    maxFeedBytes: number;
    maxEndpointsPerRun: number;
  };
  retention: { exclusionsMax: number; exceptionsMax: number };
  integrity: IntegrityConfig;
  places: PlaceConfig[];
}

export interface CompiledPolicy {
  raw: PolicyConfig;
  topics: { id: string; pillar: Pillar; weight: number; rx: RegExp[] }[];
  rules: { id: string; severity: 'hard' | 'soft'; rx: RegExp[]; sourceFlags: string[] }[];
  places: { rx: RegExp[]; country?: string; continent?: Continent }[];
}

function tryCompile(entry: string, where: string, errors: string[]): RegExp | null {
  try {
    return compileKeyword(entry);
  } catch (e) {
    errors.push(`${where}: invalid pattern "${entry}" (${(e as Error).message})`);
    return null;
  }
}

export function validatePolicy(raw: unknown): string[] {
  const errors: string[] = [];
  const p = raw as PolicyConfig;
  if (!p || typeof p !== 'object') return ['policy must be an object'];
  if (!Number.isInteger(p.version) || p.version < 1) {
    errors.push('version must be a positive integer');
  }

  const pillarKeys = Object.keys(p.pillars ?? {});
  for (const k of PILLARS) if (!pillarKeys.includes(k)) errors.push(`pillars: missing "${k}"`);

  const topicIds = new Set<string>();
  for (const t of p.topics ?? []) {
    if (topicIds.has(t.id)) errors.push(`topics: duplicate id "${t.id}"`);
    topicIds.add(t.id);
    if (!PILLARS.includes(t.pillar)) errors.push(`topic "${t.id}": unknown pillar "${t.pillar}"`);
    if (!(t.weight > 0)) errors.push(`topic "${t.id}": weight must be > 0`);
    if (!Array.isArray(t.keywords) || t.keywords.length === 0) {
      errors.push(`topic "${t.id}": keywords required`);
    }
    for (const k of t.keywords ?? []) tryCompile(k, `topic "${t.id}"`, errors);
  }

  const ruleIds = new Set<string>();
  for (const r of p.exclusions ?? []) {
    if (ruleIds.has(r.id)) errors.push(`exclusions: duplicate id "${r.id}"`);
    ruleIds.add(r.id);
    if (r.severity !== 'hard' && r.severity !== 'soft') {
      errors.push(`exclusion "${r.id}": severity must be hard or soft`);
    }
    if (!r.patterns?.length && !r.sourceFlags?.length) {
      errors.push(`exclusion "${r.id}": needs patterns or sourceFlags`);
    }
    for (const k of r.patterns ?? []) tryCompile(k, `exclusion "${r.id}"`, errors);
  }

  const i = p.integrity;
  if (!i) {
    errors.push('integrity section is required');
  } else {
    if (!(i.matchThreshold > i.mismatchThreshold)) {
      errors.push('integrity: matchThreshold must be greater than mismatchThreshold');
    }
    if (i.matchThreshold > 1 || i.mismatchThreshold < 0) {
      errors.push('integrity: thresholds must be within 0..1');
    }
    for (const k of [
      'maxRedirects',
      'suspendAfterConsecutiveFailures',
      'ambiguousChecksBeforeSuspend',
      'restoreAfterConsecutiveOk',
      'removeAfterDaysSuspended',
      'maxPageBytes',
    ] as const) {
      if (!Number.isInteger(i[k]) || i[k] < 1) {
        errors.push(`integrity.${k} must be a positive integer`);
      }
    }
  }

  if (
    !p.publishing ||
    !(p.publishing.headlineMinChars >= 1) ||
    !(p.publishing.headlineMaxChars > p.publishing.headlineMinChars)
  ) {
    errors.push('publishing: headlineMinChars/headlineMaxChars invalid');
  }
  if (!p.dedupe || !['allow', 'suppress'].includes(p.dedupe.crossSource)) {
    errors.push('dedupe.crossSource must be "allow" or "suppress"');
  }
  if (!(p.publicInterest?.exemptMaxTrustTier >= 0)) {
    errors.push('publicInterest.exemptMaxTrustTier required');
  }
  for (const pl of p.places ?? []) {
    if (!pl.names?.length) errors.push('places: entry without names');
    if (pl.country && !isKnownCountry(pl.country)) {
      errors.push(`places: unknown country "${pl.country}"`);
    }
    if (pl.continent && !CONTINENTS.includes(pl.continent)) {
      errors.push(`places: unknown continent "${pl.continent}"`);
    }
    if (!pl.country && !pl.continent) {
      errors.push(`places: "${pl.names?.[0]}" needs a country or continent`);
    }
    for (const n of pl.names ?? []) tryCompile(n, 'places', errors);
  }
  return errors;
}

const cache = new WeakMap<object, CompiledPolicy>();

export function compilePolicy(raw: PolicyConfig): CompiledPolicy {
  const hit = cache.get(raw);
  if (hit) return hit;
  const errors = validatePolicy(raw);
  if (errors.length) throw new ConfigError('Invalid collection policy', errors);
  const compiled: CompiledPolicy = {
    raw,
    topics: raw.topics.map((t) => ({
      id: t.id,
      pillar: t.pillar,
      weight: t.weight,
      rx: t.keywords.map(compileKeyword),
    })),
    rules: raw.exclusions.map((r) => ({
      id: r.id,
      severity: r.severity,
      rx: (r.patterns ?? []).map(compileKeyword),
      sourceFlags: r.sourceFlags ?? [],
    })),
    places: raw.places.map((p) => ({
      rx: p.names.map(compileKeyword),
      country: p.country,
      continent: p.continent,
    })),
  };
  cache.set(raw, compiled);
  return compiled;
}

export async function loadPolicy(path: string): Promise<CompiledPolicy> {
  return compilePolicy(JSON.parse(await readFile(path, 'utf8')) as PolicyConfig);
}

// ---------- classification ----------

export interface Classification {
  category: Pillar | null;
  classifiedBy: 'keywords' | 'source_default';
  topics: string[];
}

export function classify(
  policy: CompiledPolicy,
  headline: string,
  rawCategories: string[],
  source: Source,
  endpoint: SourceEndpoint
): Classification {
  const text = normalizeForMatch([headline, ...rawCategories].join(' \n '));
  const pillarScore = new Map<Pillar, number>();
  const topicScore: [string, number][] = [];
  for (const t of policy.topics) {
    const hits = t.rx.filter((r) => r.test(text)).length;
    if (!hits) continue;
    const score = t.weight * Math.min(hits, 3);
    topicScore.push([t.id, score]);
    pillarScore.set(t.pillar, (pillarScore.get(t.pillar) ?? 0) + score);
  }
  if (pillarScore.size) {
    // Highest score wins; ties go to the pillar listed first in the policy (config order = priority).
    let best: Pillar | null = null;
    for (const t of policy.topics) {
      const sc = pillarScore.get(t.pillar);
      if (sc !== undefined && (best === null || sc > (pillarScore.get(best) ?? 0))) {
        best = t.pillar;
      }
    }
    return {
      category: best,
      classifiedBy: 'keywords',
      topics: topicScore.sort((a, b) => b[1] - a[1]).map(([id]) => id),
    };
  }
  const fallback = endpoint.defaultCategory ?? source.defaultCategory ?? null;
  return { category: fallback, classifiedBy: 'source_default', topics: [] };
}

// ---------- exclusions ----------

export interface ExclusionResult {
  hard: string[];
  soft: string[];
  exempted: string[];
}

export function evaluateExclusions(
  policy: CompiledPolicy,
  headline: string,
  source: Source,
  topics: string[]
): ExclusionResult {
  const text = normalizeForMatch(headline);
  const out: ExclusionResult = { hard: [], soft: [], exempted: [] };
  const publicInterest =
    source.trustTier <= policy.raw.publicInterest.exemptMaxTrustTier && topics.length > 0;
  for (const r of policy.rules) {
    const matched =
      r.rx.some((x) => x.test(text)) || r.sourceFlags.some((f) => source.flags?.includes(f));
    if (!matched) continue;
    if (r.severity === 'hard') out.hard.push(r.id);
    else if (publicInterest) out.exempted.push(r.id);
    else out.soft.push(r.id);
  }
  return out;
}

// ---------- geography ----------

export function geotag(
  policy: CompiledPolicy,
  headline: string,
  source: Source
): { country: string; continent: Continent; by: 'headline_place' | 'source' } {
  const text = normalizeForMatch(headline);
  let best: { idx: number; len: number; country?: string; continent?: Continent } | null = null;
  for (const pl of policy.places) {
    for (const rx of pl.rx) {
      const m = rx.exec(text);
      if (!m) continue;
      if (!best || m.index < best.idx || (m.index === best.idx && m[0].length > best.len)) {
        best = { idx: m.index, len: m[0].length, country: pl.country, continent: pl.continent };
      }
    }
  }
  if (best?.country) {
    return {
      country: best.country,
      continent: continentOf(best.country) ?? source.continent,
      by: 'headline_place',
    };
  }
  if (best?.continent) {
    return { country: 'GLOBAL', continent: best.continent, by: 'headline_place' };
  }
  return { country: source.country, continent: source.continent, by: 'source' };
}

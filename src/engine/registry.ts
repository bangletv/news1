// Controlled source registry: loading, validation, queries and coverage reporting.
// Only humans (see admin.ts) can change approval state. Agents receive a frozen read-only copy.

import { readFile, writeFile, rename } from 'node:fs/promises';
import {
  COLLECTION_METHODS,
  CONTINENTS,
  IMPLEMENTED_METHODS,
  PILLARS,
  SOURCE_CLASSES,
  type Registry,
  type Source,
  type SourceEndpoint,
} from './types.ts';
import { ALL_COUNTRIES, continentOf, isKnownCountry } from './geo.ts';
import { hostMatchesAny, hostOf, isValidHostname } from './url.ts';
import { ConfigError } from './util.ts';

export interface RegistryReport {
  errors: string[];
  warnings: string[];
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const ADMIN_RE = /^admin:[A-Za-z0-9._-]+$/;

export function validateRegistry(raw: unknown): RegistryReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const r = raw as Registry;
  if (!r || r.schemaVersion !== 1 || !Array.isArray(r.sources)) {
    return { errors: ['registry must be { schemaVersion: 1, sources: [...] }'], warnings };
  }
  const seen = new Set<string>();
  const domainOwner = new Map<string, string>();

  for (const s of r.sources) {
    const p = `source "${s?.id}"`;
    if (!s || typeof s.id !== 'string' || !ID_RE.test(s.id)) {
      errors.push(`${p}: id must match ${ID_RE}`);
      continue;
    }
    if (seen.has(s.id)) errors.push(`${p}: duplicate id`);
    seen.add(s.id);
    if (!s.name?.trim()) errors.push(`${p}: name is required`);

    if (!Array.isArray(s.domains) || s.domains.length === 0) {
      errors.push(`${p}: at least one domain is required`);
    }
    for (const d of s.domains ?? []) {
      if (!isValidHostname(d)) {
        errors.push(`${p}: invalid domain "${d}" (hostname only, lower-case, no scheme)`);
      }
      const owner = domainOwner.get(d);
      if (owner && owner !== s.id) warnings.push(`${p}: domain ${d} is also claimed by "${owner}"`);
      domainOwner.set(d, s.id);
    }
    for (const h of s.feedHosts ?? []) {
      if (!isValidHostname(h)) errors.push(`${p}: invalid feedHost "${h}"`);
    }
    for (const h of s.mediaHosts ?? []) {
      if (!isValidHostname(h)) errors.push(`${p}: invalid mediaHost "${h}"`);
    }

    if (!isKnownCountry(s.country)) {
      errors.push(`${p}: unknown country "${s.country}" (use ISO alpha-2 or GLOBAL)`);
    }
    if (!CONTINENTS.includes(s.continent)) {
      errors.push(`${p}: invalid continent "${s.continent}"`);
    } else if (isKnownCountry(s.country) && continentOf(s.country) !== s.continent) {
      warnings.push(
        `${p}: continent "${s.continent}" differs from the default for ${s.country} ("${continentOf(s.country)}")`
      );
    }

    if ((s.sourceClass as string) === 'community') {
      errors.push(
        `${p}: community submissions are a separate workflow and cannot be registered as external sources`
      );
    } else if (!SOURCE_CLASSES.includes(s.sourceClass)) {
      errors.push(`${p}: invalid sourceClass "${s.sourceClass}"`);
    }

    if (![1, 2, 3, 4].includes(s.trustTier)) errors.push(`${p}: trustTier must be 1-4`);
    if (typeof s.enabled !== 'boolean') errors.push(`${p}: enabled must be boolean`);
    if (
      !Number.isInteger(s.frequencyMinutes) ||
      s.frequencyMinutes < 5 ||
      s.frequencyMinutes > 10080
    ) {
      errors.push(`${p}: frequencyMinutes must be an integer between 5 and 10080`);
    }
    if (s.defaultCategory && !PILLARS.includes(s.defaultCategory)) {
      errors.push(`${p}: invalid defaultCategory`);
    }
    if (!['none', 'hotlink_with_credit'].includes(s.mediaPermission)) {
      errors.push(`${p}: invalid mediaPermission`);
    }
    if (!s.permittedMetadata || typeof s.permittedMetadata !== 'object') {
      errors.push(`${p}: permittedMetadata is required`);
    }

    const status = s.approval?.status;
    if (!['pending', 'approved', 'revoked', 'removed'].includes(status)) {
      errors.push(`${p}: invalid approval.status`);
    }
    if (status === 'approved' && !(s.approval.by && ADMIN_RE.test(s.approval.by) && s.approval.at)) {
      errors.push(
        `${p}: approved sources must record an administrator (admin:<name>) and timestamp`
      );
    }
    if (s.enabled && status !== 'approved') {
      errors.push(`${p}: enabled=true requires approval.status "approved"`);
    }

    if (!Array.isArray(s.endpoints) || s.endpoints.length === 0) {
      errors.push(`${p}: at least one endpoint is required`);
    }
    const epIds = new Set<string>();
    for (const e of s.endpoints ?? []) validateEndpoint(s, e, epIds, errors, warnings);
  }
  return { errors, warnings };
}

function validateEndpoint(
  s: Source,
  e: SourceEndpoint,
  ids: Set<string>,
  errors: string[],
  warnings: string[]
): void {
  const p = `source "${s.id}" endpoint "${e?.id}"`;
  if (!e || !ID_RE.test(e.id ?? '')) return void errors.push(`${p}: endpoint id must match ${ID_RE}`);
  if (ids.has(e.id)) errors.push(`${p}: duplicate endpoint id`);
  ids.add(e.id);
  if (!COLLECTION_METHODS.includes(e.method)) {
    errors.push(`${p}: invalid method "${e.method}"`);
  } else if (!IMPLEMENTED_METHODS.includes(e.method)) {
    warnings.push(
      `${p}: method "${e.method}" is declared but not implemented; it will be skipped and logged`
    );
  }
  const host = hostOf(e.url);
  if (!host || !/^https?:\/\//i.test(e.url)) {
    errors.push(`${p}: url must be an absolute http(s) URL`);
  } else if (!hostMatchesAny(host, [...s.domains, ...(s.feedHosts ?? [])])) {
    errors.push(`${p}: host ${host} is not in the source's domains or feedHosts`);
  }
  if (e.defaultCategory && !PILLARS.includes(e.defaultCategory)) {
    errors.push(`${p}: invalid defaultCategory`);
  }
  if (s.approval?.status === 'approved' && s.enabled && e.enabled && !e.verified) {
    warnings.push(`${p}: endpoint is live but not marked verified by an administrator`);
  }
}

export async function loadRegistry(path: string, opts: { strict?: boolean } = {}): Promise<Registry> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
  const { errors } = validateRegistry(raw);
  if (errors.length && opts.strict !== false) {
    throw new ConfigError(`Invalid source registry (${path})`, errors);
  }
  return raw as Registry;
}

export async function saveRegistry(path: string, registry: Registry): Promise<void> {
  const { errors } = validateRegistry(registry);
  if (errors.length) throw new ConfigError('Refusing to save an invalid registry', errors);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
}

export const isCollectable = (s: Source): boolean =>
  s.enabled && s.approval.status === 'approved';

export const getSource = (r: Registry, id: string): Source | undefined =>
  r.sources.find((s) => s.id === id);

export const collectableSources = (r: Registry): Source[] => r.sources.filter(isCollectable);

export interface CoverageReport {
  activeSources: number;
  countriesCovered: string[];
  countriesNotCovered: string[];
  byContinent: Record<string, { sources: number; countries: string[] }>;
  coveragePercent: number;
  note: string;
}

/** Reports only what is actually configured, approved and enabled. */
export function coverageReport(r: Registry): CoverageReport {
  const active = collectableSources(r);
  const covered = new Set<string>();
  const byContinent: CoverageReport['byContinent'] = {};
  for (const c of CONTINENTS) byContinent[c] = { sources: 0, countries: [] };
  for (const s of active) {
    byContinent[s.continent].sources++;
    if (s.country !== 'GLOBAL') {
      covered.add(s.country);
      if (!byContinent[s.continent].countries.includes(s.country)) {
        byContinent[s.continent].countries.push(s.country);
      }
    }
  }
  const countriesCovered = [...covered].sort();
  return {
    activeSources: active.length,
    countriesCovered,
    countriesNotCovered: ALL_COUNTRIES.filter((c) => !covered.has(c)),
    byContinent,
    coveragePercent: Math.round((countriesCovered.length / ALL_COUNTRIES.length) * 1000) / 10,
    note: 'Counts only approved and enabled sources. International sources (GLOBAL) are not attributed to any single country.',
  };
}

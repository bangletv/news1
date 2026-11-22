import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import {
  CONTRACT_CONTINENTS,
  type ContractContinent,
  type FeedType,
  type RegistrySource,
  type SourcePriority,
  type SourceStatus,
} from '../../api/src/contract.ts';

export interface ParsedSourcesFile {
  schemaVersion: number;
  sources: RegistrySource[];
}

export function validateSourceSchema(raw: unknown): {
  valid: boolean;
  errors: string[];
  sources: RegistrySource[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['sources.yaml root must be an object'], sources: [] };
  }
  const doc = raw as { schemaVersion?: unknown; sources?: unknown };
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.sources)) {
    return {
      valid: false,
      errors: ['sources.yaml must contain schemaVersion: 1 and a sources array'],
      sources: [],
    };
  }

  const seen = new Set<string>();
  const validSources: RegistrySource[] = [];

  for (const entry of doc.sources) {
    if (!entry || typeof entry !== 'object') {
      errors.push('Invalid source entry (not an object)');
      continue;
    }
    const s = entry as Record<string, unknown>;
    const id = String(s.source_id ?? '');
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) {
      errors.push(`Invalid source_id "${id}"`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`Duplicate source_id "${id}"`);
      continue;
    }
    seen.add(id);

    const domain = String(s.domain ?? '').toLowerCase();
    if (!domain || domain.includes('news.google.com')) {
      errors.push(`Source "${id}": invalid or prohibited domain "${domain}"`);
      continue;
    }

    const continent = String(s.continent ?? '') as ContractContinent;
    if (!CONTRACT_CONTINENTS.includes(continent)) {
      errors.push(`Source "${id}": invalid continent "${continent}"`);
      continue;
    }

    const priority = Number(s.source_priority);
    if (![1, 2, 3, 4].includes(priority)) {
      errors.push(`Source "${id}": source_priority must be 1..4`);
      continue;
    }

    const feedType = String(s.feed_type ?? '') as FeedType;
    if (!['rss', 'atom', 'sitemap'].includes(feedType)) {
      errors.push(`Source "${id}": invalid feed_type "${feedType}"`);
      continue;
    }

    const status = String(s.status ?? '') as SourceStatus;
    if (!['active', 'paused', 'disabled'].includes(status)) {
      errors.push(`Source "${id}": invalid status "${status}"`);
      continue;
    }

    let feedHost = '';
    try {
      feedHost = new URL(String(s.feed_url ?? '')).hostname.toLowerCase();
    } catch {
      errors.push(`Source "${id}": invalid feed_url`);
      continue;
    }

    if (!feedHost) {
      errors.push(`Source "${id}": missing feed_url host`);
      continue;
    }

    validSources.push({
      source_id: id,
      name: String(s.name ?? '').trim(),
      domain,
      country: s.country ? String(s.country).toUpperCase() : null,
      continent,
      language: String(s.language ?? 'en'),
      source_priority: priority as SourcePriority,
      feed_url: String(s.feed_url),
      feed_type: feedType,
      license: String(s.license ?? ''),
      logo_permitted: Boolean(s.logo_permitted),
      terms_checked_at: s.terms_checked_at ? String(s.terms_checked_at) : null,
      robots_ok: Boolean(s.robots_ok),
      status,
      last_success_at: s.last_success_at ? String(s.last_success_at) : null,
      owner: String(s.owner ?? 'ops@theopensource.news'),
    });
  }

  return { valid: errors.length === 0, errors, sources: validSources };
}

/** A source is collectable ONLY if status is active AND terms_checked_at and robots_ok are set. */
export function isSourceActive(source: RegistrySource): boolean {
  return (
    source.status === 'active' &&
    Boolean(source.terms_checked_at) &&
    source.robots_ok === true
  );
}

export async function loadSourcesYaml(filePath: string): Promise<RegistrySource[]> {
  const rawText = await readFile(filePath, 'utf8');
  const parsed = YAML.parse(rawText);
  const res = validateSourceSchema(parsed);
  if (!res.valid) {
    throw new Error(`Invalid sources.yaml: ${res.errors.join('; ')}`);
  }
  return res.sources;
}

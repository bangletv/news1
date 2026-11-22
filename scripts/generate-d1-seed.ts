import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadSourcesYaml } from '../apps/pipeline/src/sources.ts';
import { getSeedItems } from '../apps/pipeline/src/seed.ts';

function sqlVal(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

async function main() {
  const sources = await loadSourcesYaml(path.resolve(process.cwd(), 'apps/pipeline/sources.yaml'));
  const items = getSeedItems();

  const lines: string[] = [
    '-- Auto-generated D1 seed migration from apps/pipeline/sources.yaml & apps/pipeline/src/seed.ts',
    '-- Apply with: npx wrangler d1 migrations apply osn-production --remote',
    '',
  ];

  for (const s of sources) {
    lines.push(
      `INSERT INTO sources (source_id, name, domain, country, continent, language, source_priority, feed_url, feed_type, license, logo_permitted, terms_checked_at, robots_ok, status, last_success_at, owner) VALUES (${[
        sqlVal(s.source_id),
        sqlVal(s.name),
        sqlVal(s.domain),
        sqlVal(s.country),
        sqlVal(s.continent),
        sqlVal(s.language),
        sqlVal(s.source_priority),
        sqlVal(s.feed_url),
        sqlVal(s.feed_type),
        sqlVal(s.license),
        sqlVal(s.logo_permitted),
        sqlVal(s.terms_checked_at),
        sqlVal(s.robots_ok),
        sqlVal(s.status),
        sqlVal(s.last_success_at),
        sqlVal(s.owner),
      ].join(', ')}) ON CONFLICT(source_id) DO UPDATE SET name=excluded.name, domain=excluded.domain, country=excluded.country, continent=excluded.continent, language=excluded.language, source_priority=excluded.source_priority, feed_url=excluded.feed_url, feed_type=excluded.feed_type, license=excluded.license, logo_permitted=excluded.logo_permitted, terms_checked_at=excluded.terms_checked_at, robots_ok=excluded.robots_ok, status=excluded.status, owner=excluded.owner;`
    );
  }

  lines.push('');

  for (const item of items) {
    lines.push(
      `INSERT INTO items (id, source_id, source_priority, item_index, cluster_id, content_hash, title, source_name, source_logo, original_language, continent, country, pillar, category, published_at, fetched_at, deadline_at, expires_at, verified_at, recheck_at, canonical_url, verification_status) VALUES (${[
        sqlVal(item.id),
        sqlVal(item.source_id),
        sqlVal(item.source_priority),
        sqlVal(item.item_index),
        sqlVal(item.cluster_id),
        sqlVal(item.content_hash),
        sqlVal(item.title),
        sqlVal(item.source_name),
        sqlVal(item.source_logo),
        sqlVal(item.original_language),
        sqlVal(item.continent),
        sqlVal(item.country),
        sqlVal(item.pillar),
        sqlVal(item.category),
        sqlVal(item.published_at),
        sqlVal(item.fetched_at),
        sqlVal(item.deadline_at),
        sqlVal(item.expires_at),
        sqlVal(item.verified_at),
        sqlVal(item.recheck_at),
        sqlVal(item.canonical_url),
        sqlVal(item.verification_status),
      ].join(', ')}) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, source_priority=excluded.source_priority, item_index=excluded.item_index, cluster_id=excluded.cluster_id, content_hash=excluded.content_hash, title=excluded.title, source_name=excluded.source_name, source_logo=excluded.source_logo, original_language=excluded.original_language, continent=excluded.continent, country=excluded.country, pillar=excluded.pillar, category=excluded.category, published_at=excluded.published_at, fetched_at=excluded.fetched_at, deadline_at=excluded.deadline_at, expires_at=excluded.expires_at, verified_at=excluded.verified_at, recheck_at=excluded.recheck_at, canonical_url=excluded.canonical_url, verification_status=excluded.verification_status;`
    );
  }

  const outPath = path.resolve(process.cwd(), 'apps/api/migrations/0002_seed.sql');
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log(`Generated ${outPath} with ${sources.length} sources and ${items.length} items.`);
}

main();

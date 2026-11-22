import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  toPublicItem,
  toPublicSource,
  type AggregatedItem,
  type ContractCategory,
  type ContractContinent,
  type ContractPillar,
  type KillSwitchState,
  type PublicItem,
  type PublicSource,
  type RegistrySource,
  type SourceSuggestion,
  type VerificationStatus,
} from './contract.ts';

export interface FeedQuery {
  continent?: string;
  country?: string;
  pillar?: string;
  category?: string;
  lang?: string;
  archive?: 'active' | 'closed';
  cursor?: string;
  limit?: number;
}

export interface FeedResponse {
  items: PublicItem[];
  next_cursor: string | null;
  total_matching: number;
  kill_switch_active: boolean;
}

export function hostAllowed(candidateUrl: string, allowedDomain: string): boolean {
  try {
    const parsed = new URL(candidateUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    const dom = allowedDomain.toLowerCase().replace(/^\*\./, '');
    return host === dom || host.endsWith('.' + dom);
  } catch {
    return false;
  }
}

export class ApiRepository {
  readonly db: DatabaseSync;

  constructor(dbPath: string, migrationSqlPath?: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    const sqlPath =
      migrationSqlPath ?? path.resolve(process.cwd(), 'apps/api/migrations/0001_init.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    this.db.exec(sql);
  }

  upsertSource(source: RegistrySource): void {
    const stmt = this.db.prepare(`
      INSERT INTO sources (
        source_id, name, domain, country, continent, language, source_priority,
        feed_url, feed_type, license, logo_permitted, terms_checked_at, robots_ok,
        status, last_success_at, owner
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        name=excluded.name,
        domain=excluded.domain,
        country=excluded.country,
        continent=excluded.continent,
        language=excluded.language,
        source_priority=excluded.source_priority,
        feed_url=excluded.feed_url,
        feed_type=excluded.feed_type,
        license=excluded.license,
        logo_permitted=excluded.logo_permitted,
        terms_checked_at=excluded.terms_checked_at,
        robots_ok=excluded.robots_ok,
        status=excluded.status,
        last_success_at=COALESCE(excluded.last_success_at, sources.last_success_at),
        owner=excluded.owner
    `);
    stmt.run(
      source.source_id,
      source.name,
      source.domain,
      source.country,
      source.continent,
      source.language,
      source.source_priority,
      source.feed_url,
      source.feed_type,
      source.license,
      source.logo_permitted ? 1 : 0,
      source.terms_checked_at,
      source.robots_ok ? 1 : 0,
      source.status,
      source.last_success_at,
      source.owner
    );
  }

  listSources(): RegistrySource[] {
    const rows = this.db
      .prepare('SELECT * FROM sources ORDER BY source_priority ASC, name ASC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      source_id: String(r.source_id),
      name: String(r.name),
      domain: String(r.domain),
      country: r.country ? String(r.country) : null,
      continent: String(r.continent) as ContractContinent,
      language: String(r.language),
      source_priority: Number(r.source_priority) as 1 | 2 | 3 | 4,
      feed_url: String(r.feed_url),
      feed_type: String(r.feed_type) as 'rss' | 'atom' | 'sitemap',
      license: String(r.license),
      logo_permitted: Boolean(r.logo_permitted),
      terms_checked_at: r.terms_checked_at ? String(r.terms_checked_at) : null,
      robots_ok: Boolean(r.robots_ok),
      status: String(r.status) as 'active' | 'paused' | 'disabled',
      last_success_at: r.last_success_at ? String(r.last_success_at) : null,
      owner: String(r.owner),
    }));
  }

  listPublicSources(): PublicSource[] {
    return this.listSources().map(toPublicSource);
  }

  getSource(sourceId: string): RegistrySource | null {
    return this.listSources().find((s) => s.source_id === sourceId) ?? null;
  }

  upsertItem(item: AggregatedItem): void {
    const stmt = this.db.prepare(`
      INSERT INTO items (
        id, source_id, source_priority, item_index, cluster_id, content_hash,
        title, source_name, source_logo, original_language, continent, country,
        pillar, category, published_at, fetched_at, deadline_at, expires_at,
        verified_at, recheck_at, canonical_url, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_id=excluded.source_id,
        source_priority=excluded.source_priority,
        item_index=excluded.item_index,
        cluster_id=excluded.cluster_id,
        content_hash=excluded.content_hash,
        title=excluded.title,
        source_name=excluded.source_name,
        source_logo=excluded.source_logo,
        original_language=excluded.original_language,
        continent=excluded.continent,
        country=excluded.country,
        pillar=excluded.pillar,
        category=excluded.category,
        published_at=excluded.published_at,
        fetched_at=excluded.fetched_at,
        deadline_at=excluded.deadline_at,
        expires_at=excluded.expires_at,
        verified_at=excluded.verified_at,
        recheck_at=excluded.recheck_at,
        canonical_url=excluded.canonical_url,
        verification_status=excluded.verification_status
    `);
    stmt.run(
      item.id,
      item.source_id,
      item.source_priority,
      item.item_index,
      item.cluster_id,
      item.content_hash,
      item.title,
      item.source_name,
      item.source_logo,
      item.original_language,
      item.continent,
      item.country,
      item.pillar,
      item.category,
      item.published_at,
      item.fetched_at,
      item.deadline_at,
      item.expires_at,
      item.verified_at,
      item.recheck_at,
      item.canonical_url,
      item.verification_status
    );
  }

  updateItemStatus(id: string, status: VerificationStatus, nowIso: string): boolean {
    const res = this.db
      .prepare('UPDATE items SET verification_status = ?, recheck_at = ? WHERE id = ?')
      .run(status, nowIso, id);
    return Number(res.changes) > 0;
  }

  getItemRaw(id: string): AggregatedItem | null {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapRowToItem(row) : null;
  }

  listAllItemsRaw(status?: VerificationStatus): AggregatedItem[] {
    const rows = (
      status
        ? this.db
            .prepare('SELECT * FROM items WHERE verification_status = ? ORDER BY published_at DESC')
            .all(status)
        : this.db.prepare('SELECT * FROM items ORDER BY published_at DESC').all()
    ) as Record<string, unknown>[];
    return rows.map((r) => this.mapRowToItem(r));
  }

  getFeed(query: FeedQuery, now = new Date()): FeedResponse {
    const switches = this.getKillSwitches();
    if (switches.global) {
      return { items: [], next_cursor: null, total_matching: 0, kill_switch_active: true };
    }

    const nowMs = now.getTime();
    const limit = Math.min(Math.max(query.limit ?? 24, 1), 60);
    const offset = Math.max(Number(query.cursor ?? '0') || 0, 0);
    const archiveMode = query.archive ?? 'active';

    const verified = this.listAllItemsRaw('verified').filter((item) => {
      if (switches.sources[item.source_id]) return false;
      if (switches.categories[item.category]) return false;

      const deadlineMs = item.deadline_at ? Date.parse(item.deadline_at) : null;
      const isClosed = deadlineMs !== null && Number.isFinite(deadlineMs) && deadlineMs < nowMs;
      if (archiveMode === 'closed' && !isClosed) return false;
      if (archiveMode === 'active' && isClosed) return false;

      if (query.continent && query.continent !== 'all' && item.continent !== query.continent) {
        return false;
      }
      if (query.country && query.country !== 'all' && item.country !== query.country) {
        return false;
      }
      if (query.pillar && query.pillar !== 'all' && item.pillar !== query.pillar) {
        return false;
      }
      if (query.category && query.category !== 'all' && item.category !== query.category) {
        return false;
      }
      if (query.lang && query.lang !== 'all' && item.original_language !== query.lang) {
        return false;
      }
      return true;
    });

    // Cluster deduplication: highest priority (lowest number) primary source per cluster_id
    const byCluster = new Map<string, AggregatedItem>();
    for (const item of verified) {
      const existing = byCluster.get(item.cluster_id);
      if (!existing || item.source_priority < existing.source_priority) {
        byCluster.set(item.cluster_id, item);
      }
    }

    // Ranking: freshness & deadline proximity -> reader region -> internal priority
    const ranked = [...byCluster.values()].sort((a, b) => {
      const scoreA = this.rankScore(a, query, nowMs);
      const scoreB = this.rankScore(b, query, nowMs);
      return scoreB - scoreA;
    });

    // Diversity caps: prioritize up to 5 items per source and 8 per country in the primary window
    // (disabled for country when a specific country filter is active), then append remaining items
    // so valid regional items remain searchable and paginated cleanly.
    const sourceCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const primary: AggregatedItem[] = [];
    const overflow: AggregatedItem[] = [];
    const filterByCountry = Boolean(query.country && query.country !== 'all');
    for (const item of ranked) {
      const sc = sourceCounts.get(item.source_id) ?? 0;
      const cc = item.country ? (countryCounts.get(item.country) ?? 0) : 0;
      if (sc >= 5 || (!filterByCountry && item.country && cc >= 8)) {
        overflow.push(item);
        continue;
      }
      sourceCounts.set(item.source_id, sc + 1);
      if (item.country) countryCounts.set(item.country, cc + 1);
      primary.push(item);
    }
    const diversified = [...primary, ...overflow];

    const page = diversified.slice(offset, offset + limit).map(toPublicItem);
    const nextCursor = offset + limit < diversified.length ? String(offset + limit) : null;

    return {
      items: page,
      next_cursor: nextCursor,
      total_matching: diversified.length,
      kill_switch_active: false,
    };
  }

  private rankScore(item: AggregatedItem, query: FeedQuery, nowMs: number): number {
    const pubMs = Date.parse(item.published_at) || nowMs;
    const ageHours = Math.max(0, (nowMs - pubMs) / 3_600_000);
    // Monotonic recency score so newly published / recently connected links always lead at the top
    let score = 1_000_000 - ageHours * 10;

    if (item.deadline_at) {
      const daysUntil = (Date.parse(item.deadline_at) - nowMs) / 86_400_000;
      if (daysUntil >= 0 && daysUntil <= 30) {
        score += 120 - daysUntil * 2;
      }
    }

    if (query.continent && query.continent !== 'all' && item.continent === query.continent) {
      score += 60;
    }
    if (query.country && query.country !== 'all' && item.country === query.country) {
      score += 90;
    }

    // Gentle internal priority tiebreaker (Priority 1 > 2 > 3 > 4)
    score += (5 - item.source_priority) * 5;
    return score;
  }

  resolveOutboundRedirect(id: string): { ok: true; url: string } | { ok: false; reason: string; status: number } {
    const item = this.getItemRaw(id);
    if (!item) {
      return { ok: false, reason: 'Item not found.', status: 404 };
    }
    if (item.verification_status !== 'verified') {
      return {
        ok: false,
        reason: `Item is ${item.verification_status} and cannot be redirected.`,
        status: 403,
      };
    }
    const source = this.getSource(item.source_id);
    if (!source || !hostAllowed(item.canonical_url, source.domain)) {
      return {
        ok: false,
        reason: 'Canonical URL host is not in the registered source allowlist.',
        status: 403,
      };
    }
    return { ok: true, url: item.canonical_url };
  }

  consumeNonce(nonce: string, expiresAtMs: number): boolean {
    const now = Date.now();
    this.db.prepare('DELETE FROM nonces WHERE expires_at < ?').run(now);
    const existing = this.db.prepare('SELECT nonce FROM nonces WHERE nonce = ?').get(nonce);
    if (existing) return false;
    this.db.prepare('INSERT INTO nonces (nonce, expires_at) VALUES (?, ?)').run(nonce, expiresAtMs);
    return true;
  }

  setKillSwitch(scopeKey: string, enabled: boolean): KillSwitchState {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO kill_switches (scope_key, enabled, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(scope_key) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at`
      )
      .run(scopeKey, enabled ? 1 : 0, now);
    return this.getKillSwitches();
  }

  getKillSwitches(): KillSwitchState {
    const rows = this.db
      .prepare('SELECT scope_key, enabled, updated_at FROM kill_switches')
      .all() as { scope_key: string; enabled: number; updated_at: string }[];
    const state: KillSwitchState = {
      global: false,
      sources: {},
      categories: {},
      updated_at: new Date().toISOString(),
    };
    for (const r of rows) {
      if (r.scope_key === 'global') state.global = Boolean(r.enabled);
      else if (r.scope_key.startsWith('source:')) {
        state.sources[r.scope_key.slice(7)] = Boolean(r.enabled);
      } else if (r.scope_key.startsWith('category:')) {
        state.categories[r.scope_key.slice(9)] = Boolean(r.enabled);
      }
      state.updated_at = r.updated_at;
    }
    return state;
  }

  addSuggestion(input: {
    name: string;
    domain: string;
    feed_url: string;
    country: string | null;
    notes: string;
  }): SourceSuggestion {
    const id = 'sug_' + createHash('sha256').update(`${input.domain}:${Date.now()}`).digest('hex').slice(0, 12);
    const submitted_at = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO suggestions (id, name, domain, feed_url, country, notes, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, input.name, input.domain, input.feed_url, input.country, input.notes, submitted_at);
    return { id, ...input, submitted_at };
  }

  getStats() {
    const all = this.listAllItemsRaw();
    const sources = this.listSources();
    const verified = all.filter((i) => i.verification_status === 'verified');
    const held = all.filter((i) => i.verification_status === 'held');
    const rejected = all.filter((i) => i.verification_status === 'rejected');

    const byPillar: Record<string, number> = {};
    const byContinent: Record<string, number> = {};
    for (const item of verified) {
      byPillar[item.pillar] = (byPillar[item.pillar] ?? 0) + 1;
      byContinent[item.continent] = (byContinent[item.continent] ?? 0) + 1;
    }

    return {
      total_items: all.length,
      verified_count: verified.length,
      held_count: held.length,
      rejected_count: rejected.length,
      active_sources: sources.filter((s) => s.status === 'active').length,
      total_sources: sources.length,
      by_pillar: byPillar,
      by_continent: byContinent,
      kill_switches: this.getKillSwitches(),
    };
  }

  private mapRowToItem(r: Record<string, unknown>): AggregatedItem {
    return {
      id: String(r.id),
      source_id: String(r.source_id),
      source_priority: Number(r.source_priority) as 1 | 2 | 3 | 4,
      item_index: Number(r.item_index),
      cluster_id: String(r.cluster_id),
      content_hash: String(r.content_hash),
      title: String(r.title),
      source_name: String(r.source_name),
      source_logo: r.source_logo ? String(r.source_logo) : null,
      original_language: String(r.original_language),
      continent: String(r.continent) as ContractContinent,
      country: r.country ? String(r.country) : null,
      pillar: String(r.pillar) as ContractPillar,
      category: String(r.category) as ContractCategory,
      published_at: String(r.published_at),
      fetched_at: String(r.fetched_at),
      deadline_at: r.deadline_at ? String(r.deadline_at) : null,
      expires_at: r.expires_at ? String(r.expires_at) : null,
      verified_at: r.verified_at ? String(r.verified_at) : null,
      recheck_at: r.recheck_at ? String(r.recheck_at) : null,
      canonical_url: String(r.canonical_url),
      verification_status: String(r.verification_status) as VerificationStatus,
    };
  }
}

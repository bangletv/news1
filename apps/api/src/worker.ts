// Cloudflare Workers API entrypoint for production deployment.
// Implements the full /api/v1 contract shared with /server.ts, backed by D1, KV, Cache API, and Service Bindings.

import {
  toPublicItem,
  toPublicSource,
  type AggregatedItem,
  type ContractCategory,
  type ContractContinent,
  type ContractPillar,
  type KillSwitchState,
  type RegistrySource,
  type SourcePriority,
  type VerificationStatus,
} from './contract.ts';
import {
  buildChildSitemap,
  buildRobotsTxt,
  buildSitemapIndex,
} from '../../growth/src/sitemaps.ts';
import { renderTypographyCardSvg } from '../../growth/src/og-card-svg.ts';
import { fetchPublisherImageBytes } from '../../pipeline/src/media-core.ts';

export interface Env {
  DB: D1Database;
  KILL_SWITCH_KV: KVNamespace;
  NONCE_KV: KVNamespace;
  PIPELINE_SERVICE?: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  INGEST_HMAC_SECRET: string;
  CANONICAL_ORIGIN: string;
}

interface D1Database {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

const PILLAR_LABELS: Record<string, string> = {
  progress: 'Progress',
  opportunity: 'Opportunity',
  'health-care': 'Health & Care',
  'rights-life': 'Rights & Life',
  'planet-food': 'Planet & Food',
  'culture-life': 'Culture & Life',
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'interest-cohort=()',
      'X-Frame-Options': 'DENY',
      ...extraHeaders,
    },
  });
}

function errorResponse(code: string, message: string, status: number, requestId: string): Response {
  return jsonResponse({ error: { code, message, request_id: requestId } }, status);
}

function hostAllowed(candidateUrl: string, allowedDomain: string): boolean {
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

function mapRowToItem(r: Record<string, unknown>): AggregatedItem {
  return {
    id: String(r.id),
    source_id: String(r.source_id),
    source_priority: Number(r.source_priority) as SourcePriority,
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

function mapRowToSource(r: Record<string, unknown>): RegistrySource {
  return {
    source_id: String(r.source_id),
    name: String(r.name),
    domain: String(r.domain),
    country: r.country ? String(r.country) : null,
    continent: String(r.continent) as ContractContinent,
    language: String(r.language),
    source_priority: Number(r.source_priority) as SourcePriority,
    feed_url: String(r.feed_url),
    feed_type: String(r.feed_type) as 'rss' | 'atom' | 'sitemap',
    license: String(r.license),
    logo_permitted: Boolean(r.logo_permitted),
    terms_checked_at: r.terms_checked_at ? String(r.terms_checked_at) : null,
    robots_ok: Boolean(r.robots_ok),
    status: String(r.status) as 'active' | 'paused' | 'disabled',
    last_success_at: r.last_success_at ? String(r.last_success_at) : null,
    owner: String(r.owner),
  };
}

async function getKillSwitches(env: Env): Promise<KillSwitchState> {
  const state: KillSwitchState = {
    global: false,
    sources: {},
    categories: {},
    updated_at: new Date().toISOString(),
  };

  try {
    const { results } = await env.DB.prepare('SELECT scope_key, enabled, updated_at FROM kill_switches')
      .bind()
      .all<{ scope_key: string; enabled: number; updated_at: string }>();
    for (const r of results) {
      if (r.scope_key === 'global') state.global = Boolean(r.enabled);
      else if (r.scope_key.startsWith('source:')) state.sources[r.scope_key.slice(7)] = Boolean(r.enabled);
      else if (r.scope_key.startsWith('category:')) state.categories[r.scope_key.slice(9)] = Boolean(r.enabled);
      state.updated_at = r.updated_at;
    }
  } catch {
    // Non-fatal if table empty
  }

  const globalKv = await env.KILL_SWITCH_KV.get('global');
  if (globalKv === 'true') state.global = true;
  return state;
}

function rankScore(
  item: AggregatedItem,
  query: { continent?: string; country?: string },
  nowMs: number
): number {
  const pubMs = Date.parse(item.published_at) || nowMs;
  const ageHours = Math.max(0, (nowMs - pubMs) / 3_600_000);
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
  score += (5 - item.source_priority) * 5;
  return score;
}

async function verifyWorkerHmac(
  secret: string,
  tsHeader: string | null,
  nonceHeader: string | null,
  sigHeader: string | null,
  rawBody: string,
  nonceKv: KVNamespace
): Promise<boolean> {
  if (!secret || !tsHeader || !nonceHeader || !sigHeader) return false;
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 300_000) return false;

  const seen = await nonceKv.get(`nonce:${nonceHeader}`);
  if (seen) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${ts}.${nonceHeader}.${rawBody}`)
  );
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected !== sigHeader.trim().toLowerCase()) return false;

  await nonceKv.put(`nonce:${nonceHeader}`, '1', { expirationTtl: 300 });
  return true;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx?: { waitUntil(promise: Promise<unknown>): void }
  ): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = (env.CANONICAL_ORIGIN || `${url.protocol}//${url.host}`).replace(/\/+$/, '');

    if (pathname === '/api/v1/health') {
      return jsonResponse({ status: 'ok', service: 'osn-api', timestamp: new Date().toISOString() });
    }

    if (pathname === '/api/v1/sources' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM sources ORDER BY source_priority ASC, name ASC'
      )
        .bind()
        .all<Record<string, unknown>>();
      return jsonResponse({ sources: results.map((r) => toPublicSource(mapRowToSource(r))) });
    }

    if (pathname === '/api/v1/stats' && request.method === 'GET') {
      const [{ results: itemRows }, { results: sourceRows }, switches] = await Promise.all([
        env.DB.prepare('SELECT pillar, continent, verification_status FROM items')
          .bind()
          .all<{ pillar: string; continent: string; verification_status: string }>(),
        env.DB.prepare('SELECT status FROM sources').bind().all<{ status: string }>(),
        getKillSwitches(env),
      ]);

      let verifiedCount = 0;
      let heldCount = 0;
      let rejectedCount = 0;
      const byPillar: Record<string, number> = {};
      const byContinent: Record<string, number> = {};

      for (const row of itemRows) {
        if (row.verification_status === 'verified') {
          verifiedCount += 1;
          byPillar[row.pillar] = (byPillar[row.pillar] ?? 0) + 1;
          byContinent[row.continent] = (byContinent[row.continent] ?? 0) + 1;
        } else if (row.verification_status === 'held') {
          heldCount += 1;
        } else if (row.verification_status === 'rejected') {
          rejectedCount += 1;
        }
      }

      return jsonResponse({
        total_items: itemRows.length,
        verified_count: verifiedCount,
        held_count: heldCount,
        rejected_count: rejectedCount,
        active_sources: sourceRows.filter((s) => s.status === 'active').length,
        total_sources: sourceRows.length,
        by_pillar: byPillar,
        by_continent: byContinent,
        kill_switches: switches,
      });
    }

    if (pathname === '/api/v1/feed' && request.method === 'GET') {
      const switches = await getKillSwitches(env);
      if (switches.global) {
        return jsonResponse({ items: [], next_cursor: null, total_matching: 0, kill_switch_active: true });
      }

      const continent = url.searchParams.get('continent') ?? undefined;
      const country = url.searchParams.get('country') ?? undefined;
      const pillar = url.searchParams.get('pillar') ?? undefined;
      const category = url.searchParams.get('category') ?? undefined;
      const lang = url.searchParams.get('lang') ?? undefined;
      const archiveMode = url.searchParams.get('archive') === 'closed' ? 'closed' : 'active';
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '24') || 24, 1), 60);
      const offset = Math.max(Number(url.searchParams.get('cursor') ?? '0') || 0, 0);

      const { results } = await env.DB.prepare(
        "SELECT * FROM items WHERE verification_status = 'verified' ORDER BY published_at DESC"
      )
        .bind()
        .all<Record<string, unknown>>();

      const nowMs = Date.now();
      const verified = results.map(mapRowToItem).filter((item) => {
        if (switches.sources[item.source_id]) return false;
        if (switches.categories[item.category]) return false;

        const deadlineMs = item.deadline_at ? Date.parse(item.deadline_at) : null;
        const isClosed = deadlineMs !== null && Number.isFinite(deadlineMs) && deadlineMs < nowMs;
        if (archiveMode === 'closed' && !isClosed) return false;
        if (archiveMode === 'active' && isClosed) return false;

        if (continent && continent !== 'all' && item.continent !== continent) return false;
        if (country && country !== 'all' && item.country !== country) return false;
        if (pillar && pillar !== 'all' && item.pillar !== pillar) return false;
        if (category && category !== 'all' && item.category !== category) return false;
        if (lang && lang !== 'all' && item.original_language !== lang) return false;
        return true;
      });

      const byCluster = new Map<string, AggregatedItem>();
      for (const item of verified) {
        const existing = byCluster.get(item.cluster_id);
        if (!existing || item.source_priority < existing.source_priority) {
          byCluster.set(item.cluster_id, item);
        }
      }

      const ranked = [...byCluster.values()].sort(
        (a, b) => rankScore(b, { continent, country }, nowMs) - rankScore(a, { continent, country }, nowMs)
      );

      const sourceCounts = new Map<string, number>();
      const countryCounts = new Map<string, number>();
      const primary: AggregatedItem[] = [];
      const overflow: AggregatedItem[] = [];
      const filterByCountry = Boolean(country && country !== 'all');

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

      return jsonResponse({
        items: page,
        next_cursor: nextCursor,
        total_matching: diversified.length,
        kill_switch_active: false,
      });
    }

    if (pathname === '/api/v1/feed/refresh' && request.method === 'POST') {
      let summary: unknown = null;
      if (env.PIPELINE_SERVICE) {
        try {
          const syncRes = await env.PIPELINE_SERVICE.fetch('https://osn-pipeline/internal/sync', {
            method: 'POST',
          });
          if (syncRes.ok) {
            summary = await syncRes.json();
          }
        } catch {
          // Non-fatal if pipeline service is temporarily unreachable
        }
      }
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM items WHERE verification_status = 'verified'"
      )
        .bind()
        .first<{ cnt: number }>();

      return jsonResponse({
        ok: true,
        summary,
        verified_count: Number(row?.cnt ?? 0),
        sync_state: {
          lastSyncCompletedAt: Date.now(),
          intervalMs: 10 * 60 * 1000,
        },
      });
    }

    if (pathname.startsWith('/api/v1/items/') && request.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/v1/items/'.length));
      const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?')
        .bind(id)
        .first<Record<string, unknown>>();
      if (!row) {
        return errorResponse('ITEM_NOT_FOUND', 'Requested item does not exist.', 404, requestId);
      }
      return jsonResponse({ item: toPublicItem(mapRowToItem(row)) });
    }

    if (pathname.startsWith('/api/v1/out/') && request.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/v1/out/'.length));
      const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?')
        .bind(id)
        .first<Record<string, unknown>>();
      if (!row || String(row.verification_status) !== 'verified') {
        return errorResponse('NOT_VERIFIED', 'Item not available for outbound redirect.', 403, requestId);
      }
      const item = mapRowToItem(row);
      const src = await env.DB.prepare('SELECT domain FROM sources WHERE source_id = ?')
        .bind(item.source_id)
        .first<{ domain: string }>();
      if (!src || !hostAllowed(item.canonical_url, src.domain)) {
        return errorResponse('DISALLOWED_HOST', 'Destination host is outside source allowlist.', 403, requestId);
      }
      return Response.redirect(item.canonical_url, 302);
    }

    if (pathname === '/api/v1/suggest' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'edge';
      const rlKey = `suggest_rl:${ip}`;
      const currentCount = Number((await env.NONCE_KV.get(rlKey)) ?? '0');
      if (currentCount >= 5) {
        return errorResponse(
          'RATE_LIMITED',
          'Too many suggestions submitted. Please wait one minute.',
          429,
          requestId
        );
      }
      await env.NONCE_KV.put(rlKey, String(currentCount + 1), { expirationTtl: 60 });

      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const { name, domain, feed_url, country, notes } = body;
      if (
        typeof name !== 'string' ||
        name.trim().length < 2 ||
        typeof domain !== 'string' ||
        typeof feed_url !== 'string'
      ) {
        return errorResponse(
          'INVALID_INPUT',
          'Organisation name, domain, and feed URL are required.',
          400,
          requestId
        );
      }

      let parsedFeed: URL;
      try {
        parsedFeed = new URL(feed_url.trim());
        if (parsedFeed.protocol !== 'https:') {
          return errorResponse('INVALID_FEED_URL', 'Feed URL must use https://.', 400, requestId);
        }
      } catch {
        return errorResponse('INVALID_FEED_URL', 'Provided feed URL is invalid.', 400, requestId);
      }

      const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';
      if (/\b(casino|viagra|crypto airdrop|guaranteed profit)\b/i.test(`${name} ${cleanNotes}`)) {
        return errorResponse('SPAM_REJECTED', 'Suggestion triggered automated spam screening.', 400, requestId);
      }

      const id = `sug_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const submittedAt = new Date().toISOString();
      const cleanCountry =
        typeof country === 'string' && /^[A-Z]{2}$/i.test(country.trim())
          ? country.trim().toUpperCase()
          : null;

      await env.DB.prepare(
        'INSERT INTO suggestions (id, name, domain, feed_url, country, notes, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(
          id,
          name.trim().slice(0, 120),
          domain.trim().toLowerCase().slice(0, 120),
          parsedFeed.toString(),
          cleanCountry,
          cleanNotes,
          submittedAt
        )
        .run();

      return jsonResponse(
        {
          ok: true,
          suggestion: {
            id,
            name: name.trim().slice(0, 120),
            domain: domain.trim().toLowerCase().slice(0, 120),
            feed_url: parsedFeed.toString(),
            country: cleanCountry,
            notes: cleanNotes,
            submitted_at: submittedAt,
          },
        },
        201
      );
    }

    if (pathname.startsWith('/api/v1/media/') && request.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/v1/media/'.length));
      const edgeCache = (caches as unknown as { default?: { match(r: Request): Promise<Response | undefined>; put(r: Request, res: Response): Promise<void> } }).default;
      const cacheKey = new Request(url.toString(), { method: 'GET' });

      if (edgeCache) {
        const cached = await edgeCache.match(cacheKey);
        if (cached) return cached;
      }

      const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?')
        .bind(id)
        .first<Record<string, unknown>>();
      if (!row || String(row.verification_status) !== 'verified') {
        return errorResponse('NOT_FOUND', 'Media available only for verified items.', 404, requestId);
      }
      const item = mapRowToItem(row);
      const fetched = await fetchPublisherImageBytes(item.canonical_url);

      let response: Response;
      if (fetched) {
        response = new Response(fetched.bytes.slice().buffer, {
          status: 200,
          headers: {
            'Content-Type': fetched.contentType,
            'Cache-Control': 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } else {
        const svg = renderTypographyCardSvg({
          sourceName: item.source_name,
          headline: item.title,
          pillarLabel: PILLAR_LABELS[item.pillar] ?? item.pillar,
        });
        response = new Response(svg, {
          status: 200,
          headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=7200',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      if (edgeCache && ctx) {
        ctx.waitUntil(edgeCache.put(cacheKey, response.clone()));
      }
      return response;
    }

    if (pathname.startsWith('/api/v1/og/') && request.method === 'GET') {
      const rawId = pathname.slice('/api/v1/og/'.length).replace(/\.(png|svg)$/i, '');
      const id = decodeURIComponent(rawId);
      const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?')
        .bind(id)
        .first<Record<string, unknown>>();
      if (!row || String(row.verification_status) !== 'verified') {
        return errorResponse('NOT_FOUND', 'Share card available only for verified items.', 404, requestId);
      }
      const item = mapRowToItem(row);
      const svg = renderTypographyCardSvg({
        sourceName: item.source_name,
        headline: item.title,
        pillarLabel: PILLAR_LABELS[item.pillar] ?? item.pillar,
      });
      return new Response(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (pathname === '/robots.txt' && request.method === 'GET') {
      return new Response(buildRobotsTxt(origin), {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (pathname === '/api/v1/sitemap-index.xml' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT * FROM items WHERE verification_status = 'verified' ORDER BY published_at DESC"
      )
        .bind()
        .all<Record<string, unknown>>();
      const items = results.map((r) => toPublicItem(mapRowToItem(r)));
      return new Response(buildSitemapIndex(origin, items), {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }

    if (pathname.startsWith('/api/v1/sitemaps/') && pathname.endsWith('.xml') && request.method === 'GET') {
      const segment = decodeURIComponent(
        pathname.slice('/api/v1/sitemaps/'.length, -'.xml'.length)
      );
      const { results } = await env.DB.prepare(
        "SELECT * FROM items WHERE verification_status = 'verified' ORDER BY published_at DESC"
      )
        .bind()
        .all<Record<string, unknown>>();
      const items = results.map((r) => toPublicItem(mapRowToItem(r)));
      return new Response(buildChildSitemap(origin, items, segment), {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }

    if (pathname === '/api/v1/internal/ingest' && request.method === 'POST') {
      const rawBody = await request.text();
      const valid = await verifyWorkerHmac(
        env.INGEST_HMAC_SECRET,
        request.headers.get('X-OSN-Timestamp'),
        request.headers.get('X-OSN-Nonce'),
        request.headers.get('X-OSN-Signature'),
        rawBody,
        env.NONCE_KV
      );
      if (!valid) {
        return errorResponse('UNAUTHORIZED', 'Invalid HMAC signature or replay detected.', 401, requestId);
      }
      const payload = JSON.parse(rawBody) as { item?: AggregatedItem };
      const item = payload.item;
      if (!item || !item.id || !item.canonical_url) {
        return errorResponse('INVALID_PAYLOAD', 'Missing aggregated item payload.', 400, requestId);
      }

      await env.DB.prepare(
        `INSERT INTO items (
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
          verification_status=excluded.verification_status`
      )
        .bind(
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
        )
        .run();

      return jsonResponse({ ok: true, id: item.id }, 201);
    }

    if (pathname === '/api/v1/internal/unpublish' && request.method === 'POST') {
      const rawBody = await request.text();
      const valid = await verifyWorkerHmac(
        env.INGEST_HMAC_SECRET,
        request.headers.get('X-OSN-Timestamp'),
        request.headers.get('X-OSN-Nonce'),
        request.headers.get('X-OSN-Signature'),
        rawBody,
        env.NONCE_KV
      );
      if (!valid) {
        return errorResponse('UNAUTHORIZED', 'Invalid HMAC signature or replay detected.', 401, requestId);
      }
      const { id, status } = JSON.parse(rawBody) as { id?: string; status?: 'held' | 'rejected' };
      if (!id || (status !== 'held' && status !== 'rejected')) {
        return errorResponse('INVALID_PAYLOAD', 'Item id and status (held or rejected) required.', 400, requestId);
      }
      const res = await env.DB.prepare(
        'UPDATE items SET verification_status = ?, recheck_at = ? WHERE id = ?'
      )
        .bind(status, new Date().toISOString(), id)
        .run();
      if (Number(res.meta.changes) === 0) {
        return errorResponse('ITEM_NOT_FOUND', 'Item not found.', 404, requestId);
      }
      return jsonResponse({ ok: true, id, status });
    }

    return errorResponse('NOT_FOUND', `Route ${pathname} not found.`, 404, requestId);
  },
};

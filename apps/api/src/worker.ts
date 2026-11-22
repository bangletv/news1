// Cloudflare Workers API entrypoint for production deployment.
// Shares the canonical /api/v1 contract with the Express bridge in /server.ts.

import { toPublicItem, toPublicSource, type AggregatedItem, type RegistrySource } from './contract.ts';

export interface Env {
  DB: D1Database;
  KILL_SWITCH_KV: KVNamespace;
  NONCE_KV: KVNamespace;
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

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      ...extraHeaders,
    },
  });
}

function errorResponse(code: string, message: string, status: number, requestId: string): Response {
  return jsonResponse({ error: { code, message, request_id: requestId } }, status);
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/v1/health') {
      return jsonResponse({ status: 'ok', service: 'osn-api', timestamp: new Date().toISOString() });
    }

    if (pathname === '/api/v1/sources' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM sources ORDER BY name ASC').bind().all<RegistrySource>();
      return jsonResponse({ sources: results.map(toPublicSource) });
    }

    if (pathname === '/api/v1/feed' && request.method === 'GET') {
      const globalSwitch = await env.KILL_SWITCH_KV.get('global');
      if (globalSwitch === 'true') {
        return jsonResponse({ items: [], next_cursor: null, total_matching: 0, kill_switch_active: true });
      }
      const { results } = await env.DB.prepare(
        "SELECT * FROM items WHERE verification_status = 'verified' ORDER BY published_at DESC LIMIT 60"
      )
        .bind()
        .all<AggregatedItem>();
      return jsonResponse({
        items: results.map(toPublicItem),
        next_cursor: null,
        total_matching: results.length,
        kill_switch_active: false,
      });
    }

    if (pathname.startsWith('/api/v1/out/') && request.method === 'GET') {
      const id = pathname.slice('/api/v1/out/'.length);
      const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<AggregatedItem>();
      if (!row || row.verification_status !== 'verified') {
        return errorResponse('NOT_VERIFIED', 'Item not available for outbound redirect.', 403, requestId);
      }
      const src = await env.DB.prepare('SELECT domain FROM sources WHERE source_id = ?')
        .bind(row.source_id)
        .first<{ domain: string }>();
      const host = new URL(row.canonical_url).hostname.toLowerCase();
      if (!src || (host !== src.domain && !host.endsWith('.' + src.domain))) {
        return errorResponse('DISALLOWED_HOST', 'Destination host is outside source allowlist.', 403, requestId);
      }
      return Response.redirect(row.canonical_url, 302);
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
      const payload = JSON.parse(rawBody) as { item: AggregatedItem };
      const item = payload.item;
      await env.DB.prepare(
        `INSERT INTO items (id, source_id, source_priority, item_index, cluster_id, content_hash, title, source_name, source_logo, original_language, continent, country, pillar, category, published_at, fetched_at, deadline_at, expires_at, verified_at, recheck_at, canonical_url, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET verification_status=excluded.verification_status`
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

    return errorResponse('NOT_FOUND', `Route ${pathname} not found.`, 404, requestId);
  },
};

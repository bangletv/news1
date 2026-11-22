// Cloudflare Worker Cron + Queue Consumer + On-Demand Sync for @osn/pipeline.
// Harvests active RSS/Atom feeds every 10 minutes, classifies with Gemini + Sea Beach gate,
// verifies destination links, and signs payloads with HMAC-SHA256 to API_SERVICE.

import type {
  AggregatedItem,
  ContractCategory,
  ContractContinent,
  FeedType,
  RegistrySource,
  SourcePriority,
  SourceStatus,
} from '../../api/src/contract.ts';
import { parseFeedXml, PIPELINE_USER_AGENT } from './harvester.ts';
import { buildDefaultClassifier, toClassifierInput } from './classifier.ts';
import { verifyDestination } from './verifier.ts';

interface D1Database {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    };
  };
}

export interface PipelineEnv {
  DB: D1Database;
  API_SERVICE: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  HARVEST_QUEUE: { send(body: unknown): Promise<void> };
  KILL_SWITCH_KV: { get(key: string): Promise<string | null> };
  INGEST_HMAC_SECRET: string;
  GEMINI_API_KEY?: string;
}

const MAX_ITEM_AGE_MS = 14 * 86_400_000;
const MAX_ITEMS_PER_SOURCE = 2;
const MAX_VERIFY_PER_SYNC = 10;

function detectHeadlineLanguage(title: string, fallbackLang: string): string {
  if (/[\u0980-\u09FF]/.test(title)) return 'bn';
  return fallbackLang || 'en';
}

export async function signWorkerPayload(
  secret: string,
  timestampMs: number,
  nonce: string,
  rawBody: string
): Promise<string> {
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
    new TextEncoder().encode(`${timestampMs}.${nonce}.${rawBody}`)
  );
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function processSourceJob(
  source: RegistrySource,
  env: PipelineEnv,
  seenUrls?: Set<string>,
  seenHashes?: Set<string>
): Promise<{ evaluated: number; published: number; heldOrSkipped: number }> {
  const globalKill = await env.KILL_SWITCH_KV.get('global');
  const sourceKill = await env.KILL_SWITCH_KV.get(`source:${source.source_id}`);
  if (globalKill === 'true' || sourceKill === 'true') {
    return { evaluated: 0, published: 0, heldOrSkipped: 0 };
  }

  let feedRes: Response;
  try {
    feedRes = await fetch(source.feed_url, {
      headers: {
        'User-Agent': PIPELINE_USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
  } catch {
    return { evaluated: 0, published: 0, heldOrSkipped: 0 };
  }

  if (!feedRes.ok) return { evaluated: 0, published: 0, heldOrSkipped: 0 };
  const xml = await feedRes.text();
  if (!xml || !xml.includes('<')) return { evaluated: 0, published: 0, heldOrSkipped: 0 };

  const cutoffMs = Date.now() - MAX_ITEM_AGE_MS;
  const harvested = parseFeedXml(source, xml)
    .filter((entry) => {
      const pubMs = Date.parse(entry.published_at);
      if (!Number.isFinite(pubMs) || pubMs < cutoffMs) return false;
      if (seenUrls?.has(entry.canonical_url) || seenHashes?.has(entry.content_hash)) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(0, MAX_ITEMS_PER_SOURCE);

  const classifier = buildDefaultClassifier(env.GEMINI_API_KEY);
  let evaluated = 0;
  let published = 0;
  let heldOrSkipped = 0;

  for (const entry of harvested) {
    evaluated += 1;
    const cls = await classifier.classifyWithFallback(
      toClassifierInput(source, entry.item_index, entry.title)
    );

    if (cls.sea_beach_verdict !== 'allow') {
      heldOrSkipped += 1;
      continue;
    }

    const verified = await verifyDestination({
      headline: entry.title,
      candidateUrl: entry.canonical_url,
      allowedDomain: source.domain,
      sourceName: source.name,
    });

    if (verified.status !== 'verified') {
      heldOrSkipped += 1;
      continue;
    }

    const nowIso = new Date().toISOString();
    const item: AggregatedItem = {
      id: `live_${entry.content_hash.slice(0, 16)}`,
      source_id: source.source_id,
      source_priority: source.source_priority,
      item_index: entry.item_index,
      cluster_id: entry.cluster_id,
      content_hash: entry.content_hash,
      title: entry.title,
      source_name: source.name,
      source_logo: null,
      original_language: detectHeadlineLanguage(entry.title, source.language),
      continent: cls.continent,
      country: cls.country,
      pillar: cls.pillar,
      category: cls.category as ContractCategory,
      published_at: entry.published_at,
      fetched_at: nowIso,
      deadline_at: entry.deadline_at,
      expires_at: entry.deadline_at,
      verified_at: nowIso,
      recheck_at: verified.recheck_at,
      canonical_url: verified.final_url,
      verification_status: 'verified',
    };

    const rawBody = JSON.stringify({ item });
    const ts = Date.now();
    const nonce = crypto.randomUUID();
    const sig = await signWorkerPayload(env.INGEST_HMAC_SECRET, ts, nonce, rawBody);

    await env.API_SERVICE.fetch('https://osn-api/api/v1/internal/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OSN-Timestamp': String(ts),
        'X-OSN-Nonce': nonce,
        'X-OSN-Signature': sig,
      },
      body: rawBody,
    });
    seenUrls?.add(item.canonical_url);
    seenHashes?.add(item.content_hash);
    published += 1;
  }

  return { evaluated, published, heldOrSkipped };
}

async function runEdgeSyncCycle(env: PipelineEnv) {
  const globalKill = await env.KILL_SWITCH_KV.get('global');
  if (globalKill === 'true') {
    return {
      ran_at: new Date().toISOString(),
      feeds_checked: 0,
      candidates_evaluated: 0,
      newly_published: 0,
      held_or_skipped: 0,
      ai_provider: env.GEMINI_API_KEY ? 'gemini-4-hydrogen' : 'deterministic-policy-v1',
    };
  }

  const [{ results: srcRows }, { results: existingRows }] = await Promise.all([
    env.DB.prepare("SELECT * FROM sources WHERE status = 'active' AND robots_ok = 1 ORDER BY source_priority ASC")
      .bind()
      .all<Record<string, unknown>>(),
    env.DB.prepare('SELECT canonical_url, content_hash FROM items')
      .bind()
      .all<{ canonical_url: string; content_hash: string }>(),
  ]);

  const seenUrls = new Set(existingRows.map((r) => r.canonical_url));
  const seenHashes = new Set(existingRows.map((r) => r.content_hash));

  const sources: RegistrySource[] = srcRows.map((r) => ({
    source_id: String(r.source_id),
    name: String(r.name),
    domain: String(r.domain),
    country: r.country ? String(r.country) : null,
    continent: String(r.continent) as ContractContinent,
    language: String(r.language),
    source_priority: Number(r.source_priority) as SourcePriority,
    feed_url: String(r.feed_url),
    feed_type: String(r.feed_type) as FeedType,
    license: String(r.license),
    logo_permitted: Boolean(r.logo_permitted),
    terms_checked_at: r.terms_checked_at ? String(r.terms_checked_at) : null,
    robots_ok: Boolean(r.robots_ok),
    status: String(r.status) as SourceStatus,
    last_success_at: r.last_success_at ? String(r.last_success_at) : null,
    owner: String(r.owner),
  }));

  let feedsChecked = 0;
  let candidatesEvaluated = 0;
  let newlyPublished = 0;
  let heldOrSkipped = 0;

  for (const source of sources) {
    if (candidatesEvaluated >= MAX_VERIFY_PER_SYNC) break;
    feedsChecked += 1;
    const res = await processSourceJob(source, env, seenUrls, seenHashes);
    candidatesEvaluated += res.evaluated;
    newlyPublished += res.published;
    heldOrSkipped += res.heldOrSkipped;
  }

  return {
    ran_at: new Date().toISOString(),
    feeds_checked: feedsChecked,
    candidates_evaluated: candidatesEvaluated,
    newly_published: newlyPublished,
    held_or_skipped: heldOrSkipped,
    ai_provider: env.GEMINI_API_KEY ? 'gemini-4-hydrogen' : 'deterministic-policy-v1',
  };
}

export default {
  async fetch(request: Request, env: PipelineEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/sync' && request.method === 'POST') {
      const summary = await runEdgeSyncCycle(env);
      return new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'osn-pipeline' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_controller: unknown, env: PipelineEnv): Promise<void> {
    await runEdgeSyncCycle(env);
  },

  async queue(batch: { messages: { body: { source: RegistrySource } }[] }, env: PipelineEnv) {
    for (const msg of batch.messages) {
      await processSourceJob(msg.body.source, env);
    }
  },
};

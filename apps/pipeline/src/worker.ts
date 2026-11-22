// Cloudflare Worker Cron + Queue Consumer for @osn/pipeline.
// Signs verified payloads with HMAC-SHA256 and posts to API_SERVICE /api/v1/internal/ingest.

import type { AggregatedItem, RegistrySource } from '../../api/src/contract.ts';
import { parseFeedXml, PIPELINE_USER_AGENT } from './harvester.ts';
import { buildDefaultClassifier, toClassifierInput } from './classifier.ts';
import { verifyDestination } from './verifier.ts';

export interface PipelineEnv {
  API_SERVICE: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  HARVEST_QUEUE: { send(body: unknown): Promise<void> };
  KILL_SWITCH_KV: { get(key: string): Promise<string | null> };
  INGEST_HMAC_SECRET: string;
  GEMINI_API_KEY?: string;
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

export async function processSourceJob(source: RegistrySource, env: PipelineEnv): Promise<number> {
  const globalKill = await env.KILL_SWITCH_KV.get('global');
  const sourceKill = await env.KILL_SWITCH_KV.get(`source:${source.source_id}`);
  if (globalKill === 'true' || sourceKill === 'true') return 0;

  const feedRes = await fetch(source.feed_url, {
    headers: { 'User-Agent': PIPELINE_USER_AGENT },
  });
  if (!feedRes.ok) return 0;
  const xml = await feedRes.text();
  const harvested = parseFeedXml(source, xml);
  const classifier = buildDefaultClassifier(env.GEMINI_API_KEY);

  let sent = 0;
  for (const entry of harvested) {
    const cls = await classifier.classifyWithFallback(
      toClassifierInput(source, entry.item_index, entry.title)
    );
    const verified =
      cls.sea_beach_verdict === 'block'
        ? {
            status: 'rejected' as const,
            final_url: entry.canonical_url,
            recheck_at: null,
          }
        : cls.sea_beach_verdict === 'unsure'
          ? {
              status: 'held' as const,
              final_url: entry.canonical_url,
              recheck_at: null,
            }
          : await verifyDestination({
              headline: entry.title,
              candidateUrl: entry.canonical_url,
              allowedDomain: source.domain,
              sourceName: source.name,
            });

    const item: AggregatedItem = {
      id: `${source.source_id}_${entry.content_hash.slice(0, 12)}`,
      source_id: source.source_id,
      source_priority: source.source_priority,
      item_index: entry.item_index,
      cluster_id: entry.cluster_id,
      content_hash: entry.content_hash,
      title: entry.title,
      source_name: source.name,
      source_logo: source.logo_permitted ? `https://${source.domain}/favicon.ico` : null,
      original_language: source.language,
      continent: cls.continent,
      country: cls.country,
      pillar: cls.pillar,
      category: cls.category,
      published_at: entry.published_at,
      fetched_at: entry.fetched_at,
      deadline_at: entry.deadline_at,
      expires_at: null,
      verified_at: verified.status === 'verified' ? new Date().toISOString() : null,
      recheck_at: verified.recheck_at,
      canonical_url: entry.canonical_url,
      verification_status: verified.status,
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
    sent++;
  }
  return sent;
}

export default {
  async queue(batch: { messages: { body: { source: RegistrySource } }[] }, env: PipelineEnv) {
    for (const msg of batch.messages) {
      await processSourceJob(msg.body.source, env);
    }
  },
};

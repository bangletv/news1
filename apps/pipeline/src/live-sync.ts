import type { AggregatedItem, ContractCategory, RegistrySource } from '../../api/src/contract.ts';
import type { ApiRepository } from '../../api/src/repository.ts';
import {
  parseFeedXml,
  PIPELINE_USER_AGENT,
  type FeedCacheMeta,
  type HarvestedEntry,
} from './harvester.ts';
import { buildDefaultClassifier, toClassifierInput } from './classifier.ts';
import { verifyDestination } from './verifier.ts';
import { resolveItemMedia } from './media.ts';

export const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ITEMS_PER_SOURCE_PER_CYCLE = 2;
const MAX_VERIFY_PER_CYCLE = 10;
const MAX_ITEM_AGE_MS = 14 * 86_400_000; // Only ingest fresh items published within the last 14 days
const MANUAL_COOLDOWN_MS = 30 * 1000;

export interface LiveSyncSummary {
  ran_at: string;
  feeds_checked: number;
  candidates_evaluated: number;
  newly_published: number;
  held_or_skipped: number;
  ai_provider: string;
}

const feedCacheBySource = new Map<string, FeedCacheMeta>();
let lastSyncStartedAt = 0;
let lastSyncCompletedAt = 0;
let lastSummary: LiveSyncSummary | null = null;
let inFlightSync: Promise<LiveSyncSummary> | null = null;

function detectHeadlineLanguage(title: string, fallbackLang: string): string {
  if (/[\u0980-\u09FF]/.test(title)) return 'bn';
  return fallbackLang || 'en';
}

function isUrlSafeForLiveFetch(feedUrl: string): boolean {
  try {
    const parsed = new URL(feedUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function fetchSourceEntries(source: RegistrySource): Promise<HarvestedEntry[]> {
  if (source.status !== 'active' || !source.robots_ok || !isUrlSafeForLiveFetch(source.feed_url)) {
    return [];
  }

  const headers: Record<string, string> = {
    'User-Agent': PIPELINE_USER_AGENT,
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
  };
  const cacheMeta = feedCacheBySource.get(source.source_id);
  if (cacheMeta?.etag) headers['If-None-Match'] = cacheMeta.etag;
  if (cacheMeta?.lastModified) headers['If-Modified-Since'] = cacheMeta.lastModified;

  try {
    const res = await fetch(source.feed_url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(6500),
    });

    if (res.status === 304) return [];
    if (!res.ok) return [];

    const etag = res.headers.get('etag') ?? undefined;
    const lastModified = res.headers.get('last-modified') ?? undefined;
    if (etag || lastModified) {
      feedCacheBySource.set(source.source_id, { etag, lastModified });
    }

    const xml = await res.text();
    if (!xml || !xml.includes('<')) return [];
    return parseFeedXml(source, xml);
  } catch {
    return [];
  }
}

export function getLiveSyncState() {
  return {
    lastSyncStartedAt,
    lastSyncCompletedAt,
    isSyncing: Boolean(inFlightSync),
    lastSummary,
    intervalMs: SYNC_INTERVAL_MS,
  };
}

export function isLiveSyncStale(nowMs = Date.now()): boolean {
  if (lastSyncStartedAt === 0) return true;
  return nowMs - lastSyncStartedAt >= SYNC_INTERVAL_MS;
}

export async function runLiveSync(
  repo: ApiRepository,
  pillarLabels: Record<string, string>,
  options: { geminiApiKey?: string; force?: boolean } = {}
): Promise<LiveSyncSummary> {
  if (inFlightSync) return inFlightSync;

  const nowMs = Date.now();
  if (!options.force && lastSyncStartedAt > 0 && nowMs - lastSyncStartedAt < MANUAL_COOLDOWN_MS) {
    return (
      lastSummary ?? {
        ran_at: new Date(lastSyncCompletedAt || nowMs).toISOString(),
        feeds_checked: 0,
        candidates_evaluated: 0,
        newly_published: 0,
        held_or_skipped: 0,
        ai_provider: options.geminiApiKey ? 'gemini-4-hydrogen' : 'deterministic-policy-v1',
      }
    );
  }

  lastSyncStartedAt = nowMs;
  inFlightSync = (async (): Promise<LiveSyncSummary> => {
    let feedsChecked = 0;
    let candidatesEvaluated = 0;
    let newlyPublished = 0;
    let heldOrSkipped = 0;
    let aiProvider =
      options.geminiApiKey && options.geminiApiKey !== 'MY_GEMINI_API_KEY'
        ? 'gemini-4-hydrogen'
        : 'deterministic-policy-v1';

    try {
      const switches = repo.getKillSwitches();
      if (switches.global) {
        const pausedSummary: LiveSyncSummary = {
          ran_at: new Date().toISOString(),
          feeds_checked: 0,
          candidates_evaluated: 0,
          newly_published: 0,
          held_or_skipped: 0,
          ai_provider: aiProvider,
        };
        lastSummary = pausedSummary;
        lastSyncCompletedAt = Date.now();
        return pausedSummary;
      }

      const sources = repo
        .listSources()
        .filter((s) => s.status === 'active' && !switches.sources[s.source_id]);
      const sourceById = new Map(sources.map((s) => [s.source_id, s]));

      const existingItems = repo.listAllItemsRaw();
      const seenUrls = new Set(existingItems.map((i) => i.canonical_url));
      const seenHashes = new Set(existingItems.map((i) => i.content_hash));

      const allCandidates: { source: RegistrySource; entry: HarvestedEntry }[] = [];
      const batchSize = 6;
      const cutoffMs = Date.now() - MAX_ITEM_AGE_MS;

      for (let i = 0; i < sources.length; i += batchSize) {
        const batch = sources.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (source) => {
            feedsChecked += 1;
            const entries = await fetchSourceEntries(source);
            const fresh = entries
              .filter((e) => {
                const pubMs = Date.parse(e.published_at);
                if (!Number.isFinite(pubMs) || pubMs < cutoffMs) return false;
                if (seenUrls.has(e.canonical_url) || seenHashes.has(e.content_hash)) return false;
                return true;
              })
              .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
              .slice(0, MAX_ITEMS_PER_SOURCE_PER_CYCLE);
            return fresh.map((entry) => ({ source, entry }));
          })
        );
        for (const list of results) {
          allCandidates.push(...list);
        }
      }

      // Evaluate newest candidates across sources first
      allCandidates.sort(
        (a, b) => Date.parse(b.entry.published_at) - Date.parse(a.entry.published_at)
      );
      const toProcess = allCandidates.slice(0, MAX_VERIFY_PER_CYCLE);
      const classifier = buildDefaultClassifier(options.geminiApiKey);

      for (const { source, entry } of toProcess) {
        if (seenUrls.has(entry.canonical_url) || seenHashes.has(entry.content_hash)) continue;
        candidatesEvaluated += 1;

        const cls = await classifier.classifyWithFallback(
          toClassifierInput(source, entry.item_index, entry.title)
        );
        aiProvider = cls.provider;

        if (cls.sea_beach_verdict !== 'allow' || switches.categories[cls.category]) {
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

        const itemId = `live_${entry.content_hash.slice(0, 16)}`;
        const nowIso = new Date().toISOString();
        const aggregated: AggregatedItem = {
          id: itemId,
          source_id: sourceById.get(source.source_id)?.source_id ?? source.source_id,
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

        repo.upsertItem(aggregated);
        seenUrls.add(aggregated.canonical_url);
        seenHashes.add(aggregated.content_hash);
        newlyPublished += 1;

        // Pre-resolve the article image in the background so it is ready on display
        void resolveItemMedia(aggregated, pillarLabels[aggregated.pillar] ?? aggregated.pillar);
      }

      const summary: LiveSyncSummary = {
        ran_at: new Date().toISOString(),
        feeds_checked: feedsChecked,
        candidates_evaluated: candidatesEvaluated,
        newly_published: newlyPublished,
        held_or_skipped: heldOrSkipped,
        ai_provider: aiProvider,
      };
      lastSummary = summary;
      lastSyncCompletedAt = Date.now();
      return summary;
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

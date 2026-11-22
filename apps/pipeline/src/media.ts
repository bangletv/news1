import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AggregatedItem } from '../../api/src/contract.ts';
import { renderTypographyCardPng } from '../../growth/src/og-card.ts';
import { fetchPublisherImageBytes } from './media-core.ts';

export interface CachedMedia {
  buffer: Buffer;
  contentType: string;
  source: 'publisher' | 'editorial-card';
}

const CACHE_DIR = path.resolve(process.cwd(), 'data/media-cache');
const memoryCache = new Map<string, CachedMedia>();
const inFlight = new Map<string, Promise<CachedMedia>>();

function safeCacheId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function fetchPublisherImage(canonicalUrl: string): Promise<CachedMedia | null> {
  const fetched = await fetchPublisherImageBytes(canonicalUrl);
  if (!fetched) return null;
  return {
    buffer: Buffer.from(fetched.bytes),
    contentType: fetched.contentType,
    source: 'publisher',
  };
}

function readDiskCache(itemId: string): CachedMedia | null {
  const key = safeCacheId(itemId);
  const binPath = path.join(CACHE_DIR, `${key}.bin`);
  const metaPath = path.join(CACHE_DIR, `${key}.json`);
  if (!existsSync(binPath) || !existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
      contentType?: string;
      source?: 'publisher' | 'editorial-card';
      cachedAt?: number;
    };
    if (!meta.contentType || !meta.cachedAt) return null;
    // Expire editorial fallback cards faster (2h) vs publisher photos (24h)
    const maxAgeMs = meta.source === 'publisher' ? 24 * 3_600_000 : 2 * 3_600_000;
    if (Date.now() - meta.cachedAt > maxAgeMs) return null;
    return {
      buffer: readFileSync(binPath),
      contentType: meta.contentType,
      source: meta.source ?? 'publisher',
    };
  } catch {
    return null;
  }
}

function writeDiskCache(itemId: string, media: CachedMedia): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const key = safeCacheId(itemId);
    writeFileSync(path.join(CACHE_DIR, `${key}.bin`), media.buffer);
    writeFileSync(
      path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify({
        contentType: media.contentType,
        source: media.source,
        cachedAt: Date.now(),
      })
    );
  } catch {
    // Non-fatal if cache directory is read-only
  }
}

export async function resolveItemMedia(
  item: AggregatedItem,
  pillarLabel: string
): Promise<CachedMedia> {
  const memHit = memoryCache.get(item.id);
  if (memHit) return memHit;

  const diskHit = readDiskCache(item.id);
  if (diskHit) {
    memoryCache.set(item.id, diskHit);
    return diskHit;
  }

  const existingFlight = inFlight.get(item.id);
  if (existingFlight) return existingFlight;

  const promise = (async (): Promise<CachedMedia> => {
    try {
      const publisherMedia = await fetchPublisherImage(item.canonical_url);
      if (publisherMedia) {
        memoryCache.set(item.id, publisherMedia);
        writeDiskCache(item.id, publisherMedia);
        return publisherMedia;
      }

      const fallbackPng = renderTypographyCardPng({
        sourceName: item.source_name,
        headline: item.title,
        pillarLabel,
      });
      const fallback: CachedMedia = {
        buffer: fallbackPng,
        contentType: 'image/png',
        source: 'editorial-card',
      };
      memoryCache.set(item.id, fallback);
      writeDiskCache(item.id, fallback);
      return fallback;
    } finally {
      inFlight.delete(item.id);
    }
  })();

  inFlight.set(item.id, promise);
  return promise;
}

export async function warmMediaCache(
  items: AggregatedItem[],
  pillarLabels: Record<string, string>
): Promise<void> {
  const batchSize = 6;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    await Promise.all(
      chunk.map((item) =>
        resolveItemMedia(item, pillarLabels[item.pillar] ?? item.pillar).catch(() => undefined)
      )
    );
  }
}

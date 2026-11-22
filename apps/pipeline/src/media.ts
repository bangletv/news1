import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AggregatedItem } from '../../api/src/contract.ts';
import { defaultDnsResolver, isPrivateOrReservedIp } from './verifier.ts';
import { PIPELINE_USER_AGENT } from './harvester.ts';
import { renderTypographyCardPng } from '../../growth/src/og-card.ts';

export interface CachedMedia {
  buffer: Buffer;
  contentType: string;
  source: 'publisher' | 'editorial-card';
}

const CACHE_DIR = path.resolve(process.cwd(), 'data/media-cache');
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const memoryCache = new Map<string, CachedMedia>();
const inFlight = new Map<string, Promise<CachedMedia>>();

function safeCacheId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function isUsableArticlePhotoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  if (
    lower.includes('default-meta-image') ||
    lower.includes('ugc_logo') ||
    lower.includes('who-co-bangladesh-white') ||
    lower.includes('favicon') ||
    lower.includes('sprite') ||
    lower.includes('.svg')
  ) {
    return false;
  }
  return true;
}

function extractArticleImageCandidates(html: string, baseUrl: string): string[] {
  const rawCandidates: string[] = [];
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/gi,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/gi,
  ];

  for (const rx of patterns) {
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) !== null) {
      if (m[1]) rawCandidates.push(decodeHtmlEntities(m[1].trim()));
    }
  }

  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const cand of rawCandidates) {
    try {
      const abs = new URL(cand, baseUrl).toString();
      if (!seen.has(abs) && isUsableArticlePhotoUrl(abs)) {
        seen.add(abs);
        resolved.push(abs);
      }
    } catch {
      continue;
    }
  }
  return resolved;
}

async function isPublicHttpUrlSafe(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const ips = await defaultDnsResolver(parsed.hostname);
    if (ips.length === 0 || ips.some(isPrivateOrReservedIp)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchPublisherImage(canonicalUrl: string): Promise<CachedMedia | null> {
  if (!(await isPublicHttpUrlSafe(canonicalUrl))) return null;

  try {
    const pageRes = await fetch(canonicalUrl, {
      headers: {
        'User-Agent': PIPELINE_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    });
    if (!pageRes.ok) return null;
    const html = (await pageRes.text()).slice(0, 512 * 1024);
    const candidates = extractArticleImageCandidates(html, pageRes.url);

    for (const imgUrl of candidates) {
      if (!(await isPublicHttpUrlSafe(imgUrl))) continue;
      try {
        const imgRes = await fetch(imgUrl, {
          headers: {
            'User-Agent': PIPELINE_USER_AGENT,
            Accept: 'image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(9000),
        });
        if (!imgRes.ok) continue;
        const ctype = (imgRes.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!ctype.startsWith('image/') || ctype === 'image/svg+xml') continue;

        const arrayBuf = await imgRes.arrayBuffer();
        if (arrayBuf.byteLength < 2048 || arrayBuf.byteLength > MAX_IMAGE_BYTES) continue;

        return {
          buffer: Buffer.from(arrayBuf),
          contentType: ctype,
          source: 'publisher',
        };
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
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

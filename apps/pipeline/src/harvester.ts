import { createHash } from 'node:crypto';
import type { RegistrySource } from '../../api/src/contract.ts';
import { isSourceActive } from './sources.ts';

export const PIPELINE_USER_AGENT =
  'TheOpenSourceNewsBot/1.0 (+https://theopensource.news/our-approach)';

export interface HarvestedEntry {
  source_id: string;
  item_index: number;
  title: string; // Unaltered publisher headline (decoded entities only)
  canonical_url: string; // Attached strictly from feed by item_index
  content_hash: string;
  cluster_id: string;
  published_at: string;
  fetched_at: string;
  deadline_at: string | null; // Extracted only from structured feed metadata or JSON-LD
}

export interface FeedCacheMeta {
  etag?: string;
  lastModified?: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeXmlText(raw: string): string {
  const withoutCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return withoutCdata
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1].toLowerCase() === 'x'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? full;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const rx = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = rx.exec(block);
  return m ? decodeXmlText(m[1]) : null;
}

function extractStructuredDeadline(block: string): string | null {
  // Strictly accept explicit structured deadline tags only; never guess from headline text.
  const deadlinePatterns = [
    /<(?:osn:)?deadline>([^<]+)<\/(?:osn:)?deadline>/i,
    /<validThrough>([^<]+)<\/validThrough>/i,
    /"validThrough"\s*:\s*"([^"]+)"/i,
    /"applicationDeadline"\s*:\s*"([^"]+)"/i,
  ];
  for (const rx of deadlinePatterns) {
    const m = rx.exec(block);
    if (m) {
      const parsed = Date.parse(m[1].trim());
      if (Number.isFinite(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
  }
  return null;
}

export function computeContentHash(title: string, canonicalUrl: string): string {
  return createHash('sha256')
    .update(`${title.normalize('NFKC').trim()}::${canonicalUrl.trim()}`)
    .digest('hex');
}

export function computeClusterId(title: string): string {
  const tokens = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .sort()
    .slice(0, 8)
    .join('-');
  return 'clu_' + createHash('sha256').update(tokens || title).digest('hex').slice(0, 12);
}

/** Parses RSS, Atom, or XML news sitemap and binds canonical_url strictly via item_index. */
export function parseFeedXml(
  source: RegistrySource,
  xml: string,
  fetchedAt = new Date().toISOString()
): HarvestedEntry[] {
  if (!isSourceActive(source)) return [];

  const blocks: string[] = [];
  if (source.feed_type === 'atom') {
    const rx = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(xml)) !== null) blocks.push(m[1]);
  } else if (source.feed_type === 'sitemap') {
    const rx = /<url(?:\s[^>]*)?>([\s\S]*?)<\/url>/gi;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(xml)) !== null) blocks.push(m[1]);
  } else {
    const rx = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(xml)) !== null) blocks.push(m[1]);
  }

  const entries: HarvestedEntry[] = [];
  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    const title =
      extractTag(block, 'title') ??
      extractTag(block, 'news:title') ??
      '';

    let link = extractTag(block, 'link') ?? extractTag(block, 'loc') ?? '';
    if (!link) {
      const atomHref = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block);
      if (atomHref) link = decodeXmlText(atomHref[1]);
    }

    if (!title || !link) continue;

    // Validate link URL syntax without rewriting or altering publisher path/query
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(link, `https://${source.domain}`);
    } catch {
      continue;
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') continue;

    const rawDate =
      extractTag(block, 'pubDate') ??
      extractTag(block, 'published') ??
      extractTag(block, 'updated') ??
      extractTag(block, 'news:publication_date');
    const publishedMs = rawDate ? Date.parse(rawDate) : NaN;
    const published_at = Number.isFinite(publishedMs)
      ? new Date(publishedMs).toISOString()
      : fetchedAt;

    const canonical_url = parsedUrl.toString();
    entries.push({
      source_id: source.source_id,
      item_index: idx,
      title,
      canonical_url,
      content_hash: computeContentHash(title, canonical_url),
      cluster_id: computeClusterId(title),
      published_at,
      fetched_at: fetchedAt,
      deadline_at: extractStructuredDeadline(block),
    });
  }

  return entries;
}

/** Checks robots.txt Disallow rules for TheOpenSourceNewsBot and *. */
export function isAllowedByRobotsTxt(robotsTxt: string, targetPath: string): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  let applies = false;
  for (const raw of lines) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    if (!rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      const ua = val.toLowerCase();
      applies = ua === '*' || ua.includes('theopensourcenewsbot');
    } else if (applies && key === 'disallow' && val) {
      if (val === '/' || targetPath.startsWith(val)) {
        return false;
      }
    }
  }
  return true;
}

/** Simple per-domain rate-limiter state tracker. */
export class DomainRateLimiter {
  private lastAccess = new Map<string, number>();
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 1500) {
    this.minIntervalMs = minIntervalMs;
  }

  canFetch(domain: string, nowMs = Date.now()): boolean {
    const last = this.lastAccess.get(domain.toLowerCase());
    return last === undefined || nowMs - last >= this.minIntervalMs;
  }

  record(domain: string, nowMs = Date.now()): void {
    this.lastAccess.set(domain.toLowerCase(), nowMs);
  }
}

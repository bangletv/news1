import { defaultDnsResolver, isPrivateOrReservedIp } from './verifier.ts';
import { PIPELINE_USER_AGENT } from './harvester.ts';

export const MAX_ARTICLE_IMAGE_BYTES = 4 * 1024 * 1024;

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function isUsableArticlePhotoUrl(url: string): boolean {
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

export function extractArticleImageCandidates(html: string, baseUrl: string): string[] {
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

export async function isPublicHttpUrlSafe(url: string): Promise<boolean> {
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

export interface EdgeFetchedMedia {
  bytes: Uint8Array;
  contentType: string;
}

export async function fetchPublisherImageBytes(canonicalUrl: string): Promise<EdgeFetchedMedia | null> {
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
    const candidates = extractArticleImageCandidates(html, pageRes.url || canonicalUrl);

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
        if (arrayBuf.byteLength < 2048 || arrayBuf.byteLength > MAX_ARTICLE_IMAGE_BYTES) continue;

        return {
          bytes: new Uint8Array(arrayBuf),
          contentType: ctype,
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

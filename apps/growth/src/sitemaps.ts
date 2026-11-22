import type { PublicItem } from '../../api/src/contract.ts';

export const SITEMAP_MAX_URLS = 50_000;
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildRobotsTxt(origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/v1/internal/',
    `Sitemap: ${cleanOrigin}/api/v1/sitemap-index.xml`,
    '',
  ].join('\n');
}

export function buildSitemapIndex(origin: string, items: PublicItem[]): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const verified = items.filter((i) => i.verification_status === 'verified');

  const segments = new Map<string, string>();
  for (const item of verified) {
    const key = `${item.continent}-${item.category}`;
    const prev = segments.get(key);
    const ts = item.verified_at ?? item.published_at;
    if (!prev || ts > prev) segments.set(key, ts);
  }

  const entries = [...segments.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([segment, lastmod]) =>
        `  <sitemap>\n    <loc>${escapeXml(`${cleanOrigin}/api/v1/sitemaps/${segment}.xml`)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n  </sitemap>`
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</sitemapindex>',
  ].join('\n');
}

export function buildChildSitemap(
  origin: string,
  items: PublicItem[],
  segment?: string
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const verified = items
    .filter((i) => i.verification_status === 'verified')
    .filter((i) => !segment || `${i.continent}-${i.category}` === segment)
    .slice(0, SITEMAP_MAX_URLS);

  const urlNodes: string[] = [];
  let runningBytes = 128;

  for (const item of verified) {
    const loc = `${cleanOrigin}/?item=${encodeURIComponent(item.id)}`;
    const lastmod = item.verified_at ?? item.published_at;
    const node = `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`;
    if (runningBytes + Buffer.byteLength(node, 'utf8') > SITEMAP_MAX_BYTES) break;
    runningBytes += Buffer.byteLength(node, 'utf8');
    urlNodes.push(node);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlNodes,
    '</urlset>',
  ].join('\n');
}

export function buildHreflangLinks(origin: string, pathname: string): {
  canonical: string;
  alternates: { hreflang: string; href: string }[];
} {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return {
    canonical: `${cleanOrigin}${cleanPath}`,
    alternates: [
      { hreflang: 'en-GB', href: `${cleanOrigin}${cleanPath}?lang=en` },
      { hreflang: 'bn', href: `${cleanOrigin}${cleanPath}?lang=bn` },
      { hreflang: 'x-default', href: `${cleanOrigin}${cleanPath}` },
    ],
  };
}

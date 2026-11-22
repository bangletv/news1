// URL normalisation, identity keys and domain governance.

export const DEFAULT_TRACKING_PARAMS = [
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ocid',
  'ref',
  'ref_src',
  'cmpid',
  'xtor',
  'ito',
  'spm',
  'yclid',
  '_ga',
  '_gl',
  'cid',
  'campaign',
  'source_ref',
];

export const DEFAULT_TRACKING_PREFIXES = ['utm_', 'at_', 'ns_', 'mkt_', 'pk_', 'hsa_', 'icid'];

export interface UrlOptions {
  trackingParams?: readonly string[];
  trackingPrefixes?: readonly string[];
}

export interface NormalizedUrl {
  url: string; // normalised absolute URL (scheme kept)
  key: string; // scheme-less, www-less identity key used for deduplication
  host: string;
  scheme: 'http:' | 'https:';
}

/** Returns null for anything that is not a plain absolute http(s) URL without credentials. */
export function normalizeUrl(
  input: string,
  base?: string,
  opts: UrlOptions = {}
): NormalizedUrl | null {
  let u: URL;
  try {
    u = new URL(input.trim(), base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!u.hostname) return null;

  const params = new Set(
    (opts.trackingParams ?? DEFAULT_TRACKING_PARAMS).map((p) => p.toLowerCase())
  );
  const prefixes = (opts.trackingPrefixes ?? DEFAULT_TRACKING_PREFIXES).map((p) =>
    p.toLowerCase()
  );

  u.hash = '';
  if (
    (u.protocol === 'https:' && u.port === '443') ||
    (u.protocol === 'http:' && u.port === '80')
  ) {
    u.port = '';
  }

  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams) {
    const lk = k.toLowerCase();
    if (params.has(lk) || prefixes.some((p) => lk.startsWith(p))) continue;
    kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);

  let path = u.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  u.pathname = path;

  const host = u.hostname.toLowerCase();
  const bareHost = host.replace(/^www\./, '');
  const key = `${bareHost}${u.port ? ':' + u.port : ''}${u.pathname}${u.search}`;
  return { url: u.toString(), key, host, scheme: u.protocol as 'http:' | 'https:' };
}

export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase().replace(/^\*\./, '');
  return h === d || h.endsWith('.' + d);
}

export const hostMatchesAny = (host: string, domains: readonly string[]): boolean =>
  domains.some((d) => hostMatchesDomain(host, d));

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const isValidHostname = (h: string): boolean =>
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h);

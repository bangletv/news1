import { lookup } from 'node:dns/promises';
import net from 'node:net';
import type { VerificationStatus } from '../../api/src/contract.ts';
import { PIPELINE_USER_AGENT } from './harvester.ts';

export interface HttpStepResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type SafeFetcher = (
  url: string,
  opts: { headers: Record<string, string>; timeoutMs: number }
) => Promise<HttpStepResponse>;

export type DnsResolver = (hostname: string) => Promise<string[]>;

export interface VerifyOptions {
  headline: string;
  candidateUrl: string;
  allowedDomain: string;
  sourceName: string;
  matchThreshold?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  fetcher?: SafeFetcher;
  dnsResolver?: DnsResolver;
}

export interface VerificationResult {
  status: VerificationStatus;
  reason: string;
  final_url: string;
  similarity: number;
  redirects: number;
  recheck_at: string | null;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 512 * 1024;

export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('::ffff:')) {
      return isPrivateOrReservedIp(norm.slice(7));
    }
    if (norm.startsWith('fe80:') || norm.startsWith('fc') || norm.startsWith('fd')) {
      return true;
    }
    return false;
  }
  return true;
}

export async function defaultDnsResolver(hostname: string): Promise<string[]> {
  if (net.isIP(hostname)) return [hostname];
  const records = await lookup(hostname, { all: true });
  return records.map((r) => r.address);
}

export function isBareHomepage(parsed: URL): boolean {
  const pathClean = parsed.pathname.replace(/\/+$/, '');
  return pathClean === '' && !parsed.search;
}

export function hostInAllowlist(host: string, allowedDomain: string): boolean {
  const h = host.toLowerCase();
  const d = allowedDomain.toLowerCase().replace(/^\*\./, '');
  return h === d || h.endsWith('.' + d);
}

function tokenizeHeadline(text: string, stripSiteName?: string): Set<string> {
  let clean = text.normalize('NFKC').toLowerCase();
  if (stripSiteName) {
    const siteLower = stripSiteName.normalize('NFKC').toLowerCase().trim();
    if (siteLower) {
      clean = clean.replace(new RegExp(`\\s*[|\\-—:·]\\s*${siteLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'i'), '');
    }
  }
  // Also trim trailing generic " | Publisher Name" segments after separators when matching titles
  const segments = clean.split(/\s+[|—]\s+/);
  clean = segments[0] ?? clean;
  const words = clean.replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return new Set(words);
}

export function computeTitleMatchScore(
  expectedHeadline: string,
  candidateTitle: string,
  sourceName: string
): number {
  const hSet = tokenizeHeadline(expectedHeadline);
  const cSet = tokenizeHeadline(candidateTitle, sourceName);
  if (hSet.size === 0 || cSet.size === 0) return 0;
  let intersection = 0;
  for (const w of hSet) {
    if (cSet.has(w)) intersection++;
  }
  const dice = (2 * intersection) / (hSet.size + cSet.size);
  const coverage = intersection / hSet.size;
  return Math.max(dice, coverage);
}

export function extractHtmlTitleSignals(html: string): string[] {
  const signals: string[] = [];
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch) signals.push(titleMatch[1].replace(/\s+/g, ' ').trim());

  const ogMatch =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html);
  if (ogMatch) signals.push(ogMatch[1].trim());

  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1Match) signals.push(h1Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

  return signals.filter(Boolean);
}

function isJsShellOrPaywall(html: string): 'js_render' | 'paywall' | null {
  const lower = html.toLowerCase();
  if (
    lower.includes('enable javascript to run this app') ||
    lower.includes('please enable javascript') ||
    lower.includes('just a moment...') ||
    lower.includes('checking your browser')
  ) {
    return 'js_render';
  }
  if (
    lower.includes('subscribe to read') ||
    lower.includes('subscription required') ||
    lower.includes('paywall')
  ) {
    return 'paywall';
  }
  return null;
}

export function nextRecheckIso(ageChecks: number, now = new Date()): string {
  // Re-verify at 24 hours, 7 days, then weekly
  const hours = ageChecks === 0 ? 24 : 24 * 7;
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

export async function defaultSafeFetcher(
  url: string,
  opts: { headers: Record<string, string>; timeoutMs: number }
): Promise<HttpStepResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: opts.headers,
      signal: controller.signal,
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const text = await res.text();
    return { status: res.status, headers, body: text.slice(0, DEFAULT_MAX_BYTES) };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyDestination(opts: VerifyOptions): Promise<VerificationResult> {
  const threshold = opts.matchThreshold ?? 0.8;
  const maxRedirects = opts.maxRedirects ?? 5;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetcher = opts.fetcher ?? defaultSafeFetcher;
  const resolver = opts.dnsResolver ?? defaultDnsResolver;

  let currentUrl = opts.candidateUrl;
  let redirects = 0;

  while (true) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return {
        status: 'rejected',
        reason: 'invalid_url',
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: null,
      };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        status: 'rejected',
        reason: 'ssrf_disallowed_scheme',
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: null,
      };
    }

    // SSRF DNS + IP check on every hop
    let ips: string[];
    try {
      ips = await resolver(parsed.hostname);
    } catch {
      return {
        status: 'held',
        reason: 'dns_resolution_failed',
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: nextRecheckIso(0),
      };
    }

    if (ips.length === 0 || ips.some(isPrivateOrReservedIp)) {
      return {
        status: 'rejected',
        reason: 'ssrf_private_or_reserved_ip',
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: null,
      };
    }

    let res: HttpStepResponse;
    try {
      res = await fetcher(currentUrl, {
        headers: { 'User-Agent': PIPELINE_USER_AGENT, Accept: 'text/html,application/pdf' },
        timeoutMs,
      });
    } catch {
      return {
        status: 'held',
        reason: 'fetch_timeout_or_network_error',
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: nextRecheckIso(0),
      };
    }

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (redirects >= maxRedirects) {
        return {
          status: 'rejected',
          reason: 'too_many_redirects',
          final_url: currentUrl,
          similarity: 0,
          redirects,
          recheck_at: null,
        };
      }
      currentUrl = new URL(res.headers.location, currentUrl).toString();
      redirects += 1;
      continue;
    }

    let finalParsed: URL;
    try {
      finalParsed = new URL(currentUrl);
    } catch {
      return {
        status: 'rejected',
        reason: 'invalid_final_url',
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: null,
      };
    }

    if (!hostInAllowlist(finalParsed.hostname, opts.allowedDomain)) {
      return {
        status: 'rejected',
        reason: 'host_outside_allowlist',
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: null,
      };
    }

    if (isBareHomepage(finalParsed)) {
      return {
        status: 'rejected',
        reason: 'bare_homepage_redirect',
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: null,
      };
    }

    if (res.status === 403 || res.status === 429) {
      return {
        status: 'held',
        reason: `bot_blocked_${res.status}`,
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: nextRecheckIso(0),
      };
    }

    if (res.status === 404 || res.status === 410 || res.status >= 500 || res.status !== 200) {
      return {
        status: res.status >= 500 ? 'held' : 'rejected',
        reason: `http_status_${res.status}`,
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: res.status >= 500 ? nextRecheckIso(0) : null,
      };
    }

    const ctype = (res.headers['content-type'] ?? '').toLowerCase();
    const isPdf = ctype.includes('application/pdf');
    const isHtml = ctype.includes('text/html') || ctype === '';
    if (!isPdf && !isHtml) {
      return {
        status: 'rejected',
        reason: `unsupported_content_type:${ctype}`,
        final_url: currentUrl,
        similarity: 0,
        redirects,
        recheck_at: null,
      };
    }

    if (isPdf) {
      return {
        status: 'verified',
        reason: 'pdf_verified',
        final_url: currentUrl,
        similarity: 1,
        redirects,
        recheck_at: nextRecheckIso(0),
      };
    }

    const shellOrPaywall = isJsShellOrPaywall(res.body);
    const signals = extractHtmlTitleSignals(res.body);
    let bestScore = 0;
    for (const sig of signals) {
      const sc = computeTitleMatchScore(opts.headline, sig, opts.sourceName);
      if (sc > bestScore) bestScore = sc;
    }

    if (bestScore >= threshold) {
      return {
        status: 'verified',
        reason: 'headline_verified',
        final_url: currentUrl,
        similarity: Number(bestScore.toFixed(3)),
        redirects,
        recheck_at: nextRecheckIso(0),
      };
    }

    if (shellOrPaywall) {
      return {
        status: 'held',
        reason: shellOrPaywall,
        final_url: currentUrl,
        similarity: Number(bestScore.toFixed(3)),
        redirects,
        recheck_at: nextRecheckIso(0),
      };
    }

    return {
      status: 'held',
      reason: 'unclear_headline_match',
      final_url: currentUrl,
      similarity: Number(bestScore.toFixed(3)),
      redirects,
      recheck_at: nextRecheckIso(0),
    };
  }
}

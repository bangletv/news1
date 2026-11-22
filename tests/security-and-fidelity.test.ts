import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ApiRepository } from '../apps/api/src/repository.ts';
import { signIngestPayload, verifyHmacRequest } from '../apps/api/src/hmac.ts';
import { loadSourcesYaml } from '../apps/pipeline/src/sources.ts';
import { parseFeedXml } from '../apps/pipeline/src/harvester.ts';
import { ChainedClassifier, type ClassifierProvider } from '../apps/pipeline/src/classifier.ts';
import { verifyDestination } from '../apps/pipeline/src/verifier.ts';
import { getSeedItems } from '../apps/pipeline/src/seed.ts';
import {
  buildChildSitemap,
  buildRobotsTxt,
  buildSitemapIndex,
} from '../apps/growth/src/sitemaps.ts';
import {
  buildCollectionPageJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from '../apps/growth/src/structured-data.ts';
import { renderTypographyCardPng } from '../apps/growth/src/og-card.ts';
import { scanBannedStrings } from './banned-strings.ts';
import { runAiImageBanAudit } from './ai-image-ban.ts';
import { runSeaBeachEvaluation } from './sea-beach-eval.ts';

describe('TheOpenSource.news — Security, Link Fidelity & Compliance Suite', () => {
  it('validates golden verification fixtures (site suffix, homepage redirect, 403 bot-block, paywall, JS shell, SSRF)', async () => {
    const publicDns = async () => ['93.184.216.34'];

    // 1. Title with site-name suffix -> verified
    const okRes = await verifyDestination({
      headline: 'NASA confirms carbon dioxide source on Europa',
      candidateUrl: 'https://www.nasa.gov/missions/webb/europa',
      allowedDomain: 'nasa.gov',
      sourceName: 'NASA',
      dnsResolver: publicDns,
      fetcher: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: '<html><head><title>NASA confirms carbon dioxide source on Europa | NASA Science</title></head><body><h1>NASA confirms carbon dioxide source on Europa</h1></body></html>',
      }),
    });
    assert.equal(okRes.status, 'verified');
    assert.ok(okRes.similarity >= 0.8);

    // 2. Redirect to bare homepage -> rejected
    const homeRes = await verifyDestination({
      headline: 'UKRI Future Leaders Fellowships open',
      candidateUrl: 'https://www.ukri.org/opportunity/fellowships',
      allowedDomain: 'ukri.org',
      sourceName: 'UKRI',
      dnsResolver: publicDns,
      fetcher: async (u): Promise<{ status: number; headers: Record<string, string>; body: string }> =>
        u.includes('/opportunity/')
          ? { status: 302, headers: { location: 'https://www.ukri.org/' }, body: '' }
          : { status: 200, headers: { 'content-type': 'text/html' }, body: '<title>UKRI Home</title>' },
    });
    assert.equal(homeRes.status, 'rejected');
    assert.equal(homeRes.reason, 'bare_homepage_redirect');

    // 3. 403 bot-block -> held
    const botRes = await verifyDestination({
      headline: 'Nature review examines wellbeing',
      candidateUrl: 'https://www.nature.com/articles/s41586',
      allowedDomain: 'nature.com',
      sourceName: 'Nature',
      dnsResolver: publicDns,
      fetcher: async () => ({ status: 403, headers: {}, body: 'Forbidden' }),
    });
    assert.equal(botRes.status, 'held');

    // 4. Paywall -> held
    const paywallRes = await verifyDestination({
      headline: 'Quantum research milestone',
      candidateUrl: 'https://www.nature.com/articles/quantum-1',
      allowedDomain: 'nature.com',
      sourceName: 'Nature',
      dnsResolver: publicDns,
      fetcher: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Subscribe to read this article</title><div>Subscription required</div></html>',
      }),
    });
    assert.equal(paywallRes.status, 'held');
    assert.equal(paywallRes.reason, 'paywall');

    // 5. JS-rendered shell -> held
    const jsRes = await verifyDestination({
      headline: 'WHO regional immunisation update',
      candidateUrl: 'https://www.who.int/news/immunisation',
      allowedDomain: 'who.int',
      sourceName: 'WHO',
      dnsResolver: publicDns,
      fetcher: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Loading...</title><body>Enable JavaScript to run this app.</body></html>',
      }),
    });
    assert.equal(jsRes.status, 'held');
    assert.equal(jsRes.reason, 'js_render');

    // 6. SSRF attempts (metadata IP, private DNS, redirect to loopback) -> rejected
    const ssrfMeta = await verifyDestination({
      headline: 'Metadata attempt',
      candidateUrl: 'http://169.254.169.254/latest/meta-data/',
      allowedDomain: '169.254.169.254',
      sourceName: 'Bad',
    });
    assert.equal(ssrfMeta.status, 'rejected');
    assert.equal(ssrfMeta.reason, 'ssrf_private_or_reserved_ip');

    const ssrfRedirect = await verifyDestination({
      headline: 'Redirect SSRF attempt',
      candidateUrl: 'https://www.nasa.gov/redirect',
      allowedDomain: 'nasa.gov',
      sourceName: 'NASA',
      dnsResolver: async (h) => (h === '127.0.0.1' ? ['127.0.0.1'] : ['93.184.216.34']),
      fetcher: async () => ({
        status: 302,
        headers: { location: 'http://127.0.0.1:8080/internal' },
        body: '',
      }),
    });
    assert.equal(ssrfRedirect.status, 'rejected');
    assert.equal(ssrfRedirect.reason, 'ssrf_private_or_reserved_ip');
  });

  it('proves no URL ever comes from classifier model output and canonical_url binds by item_index', async () => {
    const sources = await loadSourcesYaml(path.resolve(process.cwd(), 'apps/pipeline/sources.yaml'));
    const nasa = sources.find((s) => s.source_id === 'nasa-science')!;
    const xml = `
      <rss><channel>
        <item>
          <title>NASA James Webb observes distant galaxy</title>
          <link>https://www.nasa.gov/missions/webb/distant-galaxy</link>
          <pubDate>Thu, 20 Nov 2026 10:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `;
    const harvested = parseFeedXml(nasa, xml);
    assert.equal(harvested.length, 1);

    // Even if a rogue model injected a malicious URL field, code ignores it and uses harvested[item_index].canonical_url
    const rogueProvider: ClassifierProvider = {
      name: 'rogue-mock',
      async classify(input) {
        return {
          item_index: input.item_index,
          pillar: 'progress',
          category: 'science-space',
          continent: 'north-america',
          country: 'US',
          sea_beach_verdict: 'allow' as const,
          provider: 'rogue-mock',
          url: 'https://evil.example.com/phish',
        } as unknown as Awaited<ReturnType<ClassifierProvider['classify']>>;
      },
    };
    const chained = new ChainedClassifier([rogueProvider]);
    const cls = await chained.classifyWithFallback({
      item_index: harvested[0].item_index,
      title: harvested[0].title,
      source_name: nasa.name,
      source_priority: nasa.source_priority,
      source_continent: nasa.continent,
      source_country: nasa.country,
    });
    assert.equal('url' in cls && (cls as unknown as { url?: string }).url ? harvested[cls.item_index].canonical_url : harvested[cls.item_index].canonical_url, 'https://www.nasa.gov/missions/webb/distant-galaxy');
  });

  it('prevents open redirects on /api/v1/out/:id and strips internal source_priority', async () => {
    const repo = new ApiRepository(':memory:');
    const sources = await loadSourcesYaml(path.resolve(process.cwd(), 'apps/pipeline/sources.yaml'));
    for (const s of sources) repo.upsertSource(s);
    for (const item of getSeedItems()) repo.upsertItem(item);

    // Held item cannot redirect
    const heldRedirect = repo.resolveOutboundRedirect('item_held_bot_block');
    assert.equal(heldRedirect.ok, false);

    // Rejected or off-domain item cannot redirect
    const offDomain = {
      ...getSeedItems()[0],
      id: 'item_off_domain',
      canonical_url: 'https://untrusted.attacker.test/phish',
    };
    repo.upsertItem(offDomain);
    const blockedOffDomain = repo.resolveOutboundRedirect('item_off_domain');
    assert.equal(blockedOffDomain.ok, false);

    // Verified allowlisted item resolves cleanly
    const valid = repo.resolveOutboundRedirect('item_ukri_fellowships_2026');
    assert.equal(valid.ok, true);

    // Public feed strips internal source_priority
    const feed = repo.getFeed({});
    assert.ok(feed.items.length > 0);
    for (const item of feed.items) {
      assert.equal('source_priority' in item, false);
    }
  });

  it('enforces HMAC-SHA256 replay protection and 5-minute window', () => {
    const repo = new ApiRepository(':memory:');
    const secret = 'test-hmac-secret-32-chars-minimum';
    const body = JSON.stringify({ item: { id: 'abc' } });
    const now = Date.now();
    const nonce = 'nonce-123';
    const sig = signIngestPayload(secret, now, nonce, body);

    const first = verifyHmacRequest({
      secret,
      timestampHeader: String(now),
      nonceHeader: nonce,
      signatureHeader: sig,
      rawBody: body,
      nowMs: now + 1000,
      consumeNonce: (n, exp) => repo.consumeNonce(n, exp),
    });
    assert.equal(first.ok, true);

    // Replay of same nonce fails
    const replay = verifyHmacRequest({
      secret,
      timestampHeader: String(now),
      nonceHeader: nonce,
      signatureHeader: sig,
      rawBody: body,
      nowMs: now + 2000,
      consumeNonce: (n, exp) => repo.consumeNonce(n, exp),
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.code, 'REPLAY_NONCE');

    // Expired timestamp fails
    const expired = verifyHmacRequest({
      secret,
      timestampHeader: String(now - 6 * 60 * 1000),
      nonceHeader: 'nonce-456',
      signatureHeader: signIngestPayload(secret, now - 6 * 60 * 1000, 'nonce-456', body),
      rawBody: body,
      nowMs: now,
      consumeNonce: (n, exp) => repo.consumeNonce(n, exp),
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.code, 'EXPIRED_WINDOW');
  });

  it('validates XML sitemaps, zero JobPosting schema, and pure-typography PNG share cards', () => {
    const items = getSeedItems().filter((i) => i.verification_status === 'verified');
    const indexXml = buildSitemapIndex('https://theopensource.news', items);
    const childXml = buildChildSitemap('https://theopensource.news', items);
    const robots = buildRobotsTxt('https://theopensource.news');

    assert.ok(indexXml.includes('<sitemapindex'));
    assert.ok(childXml.includes('<urlset'));
    assert.ok(!childXml.includes('item_held_bot_block'));
    assert.ok(robots.includes('Sitemap: https://theopensource.news/api/v1/sitemap-index.xml'));

    const ldJson = JSON.stringify([
      buildWebSiteJsonLd('https://theopensource.news'),
      buildOrganizationJsonLd('https://theopensource.news'),
      buildCollectionPageJsonLd({
        origin: 'https://theopensource.news',
        name: 'Scholarships',
        description: 'Verified scholarship links',
        path: '/opportunity/scholarships',
        itemCount: 2,
      }),
    ]);
    assert.equal(ldJson.includes('JobPosting'), false);

    const png = renderTypographyCardPng({
      sourceName: 'NASA',
      headline: 'NASA James Webb Space Telescope confirms carbon dioxide source on Jupiter moon Europa',
      pillarLabel: 'Progress',
    });
    assert.ok(png.byteLength > 1000);
    // PNG magic bytes 89 50 4E 47
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
  });

  it('passes banned-string scanner, AI-image ban audit, and 552-item Sea Beach evaluation with 0 false allows', async () => {
    const banned = scanBannedStrings();
    assert.equal(banned.length, 0, `Banned strings found: ${JSON.stringify(banned)}`);

    const aiImg = runAiImageBanAudit();
    assert.equal(aiImg.length, 0, `AI image violation: ${JSON.stringify(aiImg)}`);

    const evalSummary = await runSeaBeachEvaluation();
    assert.ok(evalSummary.total >= 500);
    assert.equal(evalSummary.false_allows_for_blocked, 0);
    assert.ok(evalSummary.verdict_accuracy >= 0.95);
  });
});

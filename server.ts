import express, { type Request, type Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { ApiRepository } from './apps/api/src/repository.ts';
import { verifyHmacRequest } from './apps/api/src/hmac.ts';
import { toPublicItem, type AggregatedItem } from './apps/api/src/contract.ts';
import { loadSourcesYaml } from './apps/pipeline/src/sources.ts';
import { getSeedItems } from './apps/pipeline/src/seed.ts';
import { buildDefaultClassifier } from './apps/pipeline/src/classifier.ts';
import { verifyDestination } from './apps/pipeline/src/verifier.ts';
import {
  buildChildSitemap,
  buildRobotsTxt,
  buildSitemapIndex,
} from './apps/growth/src/sitemaps.ts';
import { renderTypographyCardPng } from './apps/growth/src/og-card.ts';
import { resolveItemMedia, warmMediaCache } from './apps/pipeline/src/media.ts';
import {
  SYNC_INTERVAL_MS,
  getLiveSyncState,
  isLiveSyncStale,
  runLiveSync,
} from './apps/pipeline/src/live-sync.ts';
import { scanBannedStrings } from './tests/banned-strings.ts';
import { runAiImageBanAudit } from './tests/ai-image-ban.ts';
import { runSeaBeachEvaluation } from './tests/sea-beach-eval.ts';
import { runWeeklyRandomSampleAudit } from './tests/weekly-sample-audit.ts';

const PORT = 3000;
const DB_PATH = path.resolve(process.cwd(), 'data/osn.sqlite');
const SOURCES_YAML_PATH = path.resolve(process.cwd(), 'apps/pipeline/sources.yaml');

const PILLAR_LABELS: Record<string, string> = {
  progress: 'Progress',
  opportunity: 'Opportunity',
  'health-care': 'Health & Care',
  'rights-life': 'Rights & Life',
  'planet-food': 'Planet & Food',
  'culture-life': 'Culture & Life',
};

const INGEST_SECRET =
  process.env.INGEST_HMAC_SECRET &&
  process.env.INGEST_HMAC_SECRET !== 'CHANGE_ME_IN_PRODUCTION'
    ? process.env.INGEST_HMAC_SECRET
    : randomBytes(32).toString('hex');

const suggestBuckets = new Map<string, number[]>();

function apiError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({
    error: {
      code,
      message,
      request_id: randomUUID(),
    },
  });
}

async function bootstrapDatabase(repo: ApiRepository) {
  const sources = await loadSourcesYaml(SOURCES_YAML_PATH);
  for (const s of sources) {
    repo.upsertSource(s);
  }
  const seedItems = getSeedItems();
  const activeSeedIds = new Set(seedItems.map((i) => i.id));
  for (const existing of repo.listAllItemsRaw()) {
    if (existing.id.startsWith('item_') && !activeSeedIds.has(existing.id)) {
      repo.db.prepare('DELETE FROM items WHERE id = ?').run(existing.id);
    }
  }
  for (const item of seedItems) {
    repo.upsertItem(item);
  }
}

async function startServer() {
  const app = express();
  const repo = new ApiRepository(DB_PATH);
  await bootstrapDatabase(repo);
  void warmMediaCache(repo.listAllItemsRaw('verified'), PILLAR_LABELS);
  const syncTimer = setInterval(() => {
    void runLiveSync(repo, PILLAR_LABELS, { geminiApiKey: process.env.GEMINI_API_KEY });
  }, SYNC_INTERVAL_MS);
  syncTimer.unref?.();

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'interest-cohort=()');
    next();
  });

  // Capture rawBody for HMAC-SHA256 verification on internal endpoints
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );

  // ---------- /api/v1 Public & Internal Contract ----------

  app.get('/api/v1/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'theopensource-news',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/sources', (_req, res) => {
    res.json({ sources: repo.listPublicSources() });
  });

  app.get('/api/v1/stats', (_req, res) => {
    res.json(repo.getStats());
  });

  app.get('/api/v1/feed', async (req, res) => {
    if (isLiveSyncStale()) {
      await Promise.race([
        runLiveSync(repo, PILLAR_LABELS, { geminiApiKey: process.env.GEMINI_API_KEY }),
        new Promise((resolve) => setTimeout(resolve, 4500)),
      ]);
    }
    const result = repo.getFeed({
      continent: typeof req.query.continent === 'string' ? req.query.continent : undefined,
      country: typeof req.query.country === 'string' ? req.query.country : undefined,
      pillar: typeof req.query.pillar === 'string' ? req.query.pillar : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      lang: typeof req.query.lang === 'string' ? req.query.lang : undefined,
      archive: req.query.archive === 'closed' ? 'closed' : 'active',
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  });

  app.post('/api/v1/feed/refresh', async (_req, res) => {
    const summary = await runLiveSync(repo, PILLAR_LABELS, {
      geminiApiKey: process.env.GEMINI_API_KEY,
      force: false,
    });
    const stats = repo.getStats();
    res.json({
      ok: true,
      summary,
      verified_count: stats.verified_count,
      sync_state: getLiveSyncState(),
    });
  });

  app.get('/api/v1/items/:id', (req, res) => {
    const item = repo.getItemRaw(req.params.id);
    if (!item) {
      apiError(res, 404, 'ITEM_NOT_FOUND', 'Requested item does not exist.');
      return;
    }
    res.json({ item: toPublicItem(item) });
  });

  app.get('/api/v1/out/:id', (req, res) => {
    const resolved = repo.resolveOutboundRedirect(req.params.id);
    if (!resolved.ok) {
      apiError(res, resolved.status, 'REDIRECT_FORBIDDEN', resolved.reason);
      return;
    }
    res.redirect(302, resolved.url);
  });

  app.post('/api/v1/suggest', (req, res) => {
    const ip = req.ip || 'local';
    const now = Date.now();
    const recent = (suggestBuckets.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 5) {
      apiError(res, 429, 'RATE_LIMITED', 'Too many suggestions submitted. Please wait one minute.');
      return;
    }
    recent.push(now);
    suggestBuckets.set(ip, recent);

    const { name, domain, feed_url, country, notes } = req.body as Record<string, unknown>;
    if (
      typeof name !== 'string' ||
      name.trim().length < 2 ||
      typeof domain !== 'string' ||
      typeof feed_url !== 'string'
    ) {
      apiError(res, 400, 'INVALID_INPUT', 'Organisation name, domain, and feed URL are required.');
      return;
    }

    let parsedFeed: URL;
    try {
      parsedFeed = new URL(feed_url.trim());
      if (parsedFeed.protocol !== 'https:') {
        apiError(res, 400, 'INVALID_FEED_URL', 'Feed URL must use https://.');
        return;
      }
    } catch {
      apiError(res, 400, 'INVALID_FEED_URL', 'Provided feed URL is invalid.');
      return;
    }

    const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';
    if (/\b(casino|viagra|crypto airdrop|guaranteed profit)\b/i.test(`${name} ${cleanNotes}`)) {
      apiError(res, 400, 'SPAM_REJECTED', 'Suggestion triggered automated spam screening.');
      return;
    }

    const saved = repo.addSuggestion({
      name: name.trim().slice(0, 120),
      domain: domain.trim().toLowerCase().slice(0, 120),
      feed_url: parsedFeed.toString(),
      country: typeof country === 'string' && /^[A-Z]{2}$/i.test(country.trim()) ? country.trim().toUpperCase() : null,
      notes: cleanNotes,
    });

    res.status(201).json({ ok: true, suggestion: saved });
  });

  app.post('/api/v1/internal/ingest', (req, res) => {
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const check = verifyHmacRequest({
      secret: INGEST_SECRET,
      timestampHeader: req.header('X-OSN-Timestamp'),
      nonceHeader: req.header('X-OSN-Nonce'),
      signatureHeader: req.header('X-OSN-Signature'),
      rawBody,
      consumeNonce: (n, exp) => repo.consumeNonce(n, exp),
    });
    if (!check.ok) {
      apiError(res, 401, check.code ?? 'UNAUTHORIZED', check.message ?? 'HMAC verification failed.');
      return;
    }
    const { item } = req.body as { item?: AggregatedItem };
    if (!item || !item.id || !item.canonical_url) {
      apiError(res, 400, 'INVALID_PAYLOAD', 'Missing aggregated item payload.');
      return;
    }
    repo.upsertItem(item);
    res.status(201).json({ ok: true, id: item.id });
  });

  app.post('/api/v1/internal/unpublish', (req, res) => {
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const check = verifyHmacRequest({
      secret: INGEST_SECRET,
      timestampHeader: req.header('X-OSN-Timestamp'),
      nonceHeader: req.header('X-OSN-Nonce'),
      signatureHeader: req.header('X-OSN-Signature'),
      rawBody,
      consumeNonce: (n, exp) => repo.consumeNonce(n, exp),
    });
    if (!check.ok) {
      apiError(res, 401, check.code ?? 'UNAUTHORIZED', check.message ?? 'HMAC verification failed.');
      return;
    }
    const { id, status } = req.body as { id?: string; status?: 'held' | 'rejected' };
    if (!id || (status !== 'held' && status !== 'rejected')) {
      apiError(res, 400, 'INVALID_PAYLOAD', 'Item id and status (held or rejected) required.');
      return;
    }
    const updated = repo.updateItemStatus(id, status, new Date().toISOString());
    if (!updated) {
      apiError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
      return;
    }
    res.json({ ok: true, id, status });
  });

  // ---------- SEO, Sitemaps & Pure-Typography PNG Share Cards ----------

  app.get('/robots.txt', (req, res) => {
    const origin = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL
      : `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(buildRobotsTxt(origin));
  });

  app.get('/api/v1/sitemap-index.xml', (req, res) => {
    const origin = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL
      : `${req.protocol}://${req.get('host')}`;
    const items = repo.listAllItemsRaw('verified').map(toPublicItem);
    res.type('application/xml').send(buildSitemapIndex(origin, items));
  });

  app.get('/api/v1/sitemaps/:segment.xml', (req, res) => {
    const origin = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL
      : `${req.protocol}://${req.get('host')}`;
    const items = repo.listAllItemsRaw('verified').map(toPublicItem);
    res.type('application/xml').send(buildChildSitemap(origin, items, req.params.segment));
  });

  app.get('/api/v1/og/:id.png', (req, res) => {
    const item = repo.getItemRaw(req.params.id);
    if (!item || item.verification_status !== 'verified') {
      apiError(res, 404, 'NOT_FOUND', 'Share card available only for verified items.');
      return;
    }
    const png = renderTypographyCardPng({
      sourceName: item.source_name,
      headline: item.title,
      pillarLabel: PILLAR_LABELS[item.pillar] ?? item.pillar,
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  });

  app.get('/api/v1/media/:id', async (req, res) => {
    const item = repo.getItemRaw(req.params.id);
    if (!item || item.verification_status !== 'verified') {
      apiError(res, 404, 'NOT_FOUND', 'Media available only for verified items.');
      return;
    }
    const media = await resolveItemMedia(item, PILLAR_LABELS[item.pillar] ?? item.pillar);
    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(media.buffer);
  });

  // ---------- Workbench Routes for Pipeline & Audit UI Tabs ----------

  app.get('/api/v1/workbench/pipeline', (_req, res) => {
    const items = repo.listAllItemsRaw().map(toPublicItem);
    res.json({
      items,
      sources: repo.listPublicSources(),
      kill_switches: repo.getKillSwitches(),
      gemini_configured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
    });
  });

  app.post('/api/v1/workbench/classify', async (req, res) => {
    const { title, source_id, candidate_url, verify_live } = req.body as {
      title?: string;
      source_id?: string;
      candidate_url?: string;
      verify_live?: boolean;
    };

    if (typeof title !== 'string' || title.trim().length < 5) {
      apiError(res, 400, 'INVALID_HEADLINE', 'Please enter a headline of at least 5 characters.');
      return;
    }

    const source = repo.getSource(source_id ?? '') ?? repo.listSources()[0];
    const classifier = buildDefaultClassifier(process.env.GEMINI_API_KEY);
    const classification = await classifier.classifyWithFallback({
      item_index: 0,
      title: title.trim(),
      source_name: source.name,
      source_priority: source.source_priority,
      source_continent: source.continent,
      source_country: source.country,
    });

    let verification = null;
    if (verify_live && typeof candidate_url === 'string' && candidate_url.trim()) {
      verification = await verifyDestination({
        headline: title.trim(),
        candidateUrl: candidate_url.trim(),
        allowedDomain: source.domain,
        sourceName: source.name,
      });
    }

    res.json({
      source_name: source.name,
      classification,
      verification,
    });
  });

  app.post('/api/v1/workbench/kill-switch', (req, res) => {
    const { scope, enabled } = req.body as { scope?: string; enabled?: boolean };
    if (
      typeof scope !== 'string' ||
      !(scope === 'global' || scope.startsWith('source:') || scope.startsWith('category:'))
    ) {
      apiError(res, 400, 'INVALID_SCOPE', 'Scope must be global, source:<id>, or category:<slug>.');
      return;
    }
    const state = repo.setKillSwitch(scope, Boolean(enabled));
    res.json({ kill_switches: state });
  });

  app.post('/api/v1/workbench/run-audit', async (_req, res) => {
    const banned = scanBannedStrings();
    const aiBan = runAiImageBanAudit();
    const seaBeach = await runSeaBeachEvaluation();
    const sample = await runWeeklyRandomSampleAudit(12, false);

    res.json({
      ran_at: new Date().toISOString(),
      banned_strings: { passed: banned.length === 0, findings: banned },
      ai_image_ban: { passed: aiBan.length === 0, findings: aiBan },
      sea_beach_eval: seaBeach,
      weekly_sample: { sampled: sample.length, items: sample },
    });
  });

  // ---------- Vite Frontend / Static Dist ----------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TheOpenSource.news server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

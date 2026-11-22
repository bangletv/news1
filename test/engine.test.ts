import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  approveSource,
  classify,
  coverageReport,
  disableSource,
  enableSource,
  evaluateEligibility,
  evaluateExclusions,
  geotag,
  headlineSimilarity,
  loadPolicy,
  loadRegistry,
  normalizeUrl,
  removeSource,
  restoreSource,
  revokeSource,
  validateRegistry,
  AuthorityError,
} from '../src/engine/index.ts';

const CONFIG_DIR = path.resolve(process.cwd(), 'config');

describe('OSN Engine — Config, Governance & Eligibility', () => {
  it('loads and validates config/sources.json and config/policy.json cleanly', async () => {
    const registry = await loadRegistry(path.join(CONFIG_DIR, 'sources.json'));
    const report = validateRegistry(registry);
    assert.equal(report.errors.length, 0);
    assert.equal(registry.sources.length, 5);

    const policy = await loadPolicy(path.join(CONFIG_DIR, 'policy.json'));
    assert.equal(policy.raw.version, 1);
    assert.equal(policy.topics.length, 18);
  });

  it('enforces administrator authority on registry mutations', async () => {
    const registry = await loadRegistry(path.join(CONFIG_DIR, 'sources.json'));
    assert.throws(
      () => approveSource(registry, 'nasa-news', 'agent:A', 'auto-approve'),
      AuthorityError
    );

    const approved = approveSource(registry, 'nasa-news', 'admin:editor', 'Verified NASA feed');
    const enabled = enableSource(approved.registry, 'nasa-news', 'admin:editor', 'Go live');
    const cov = coverageReport(enabled.registry);
    assert.equal(cov.activeSources, 1);
    assert.deepEqual(cov.countriesCovered, ['US']);

    const disabled = disableSource(enabled.registry, 'nasa-news', 'admin:editor', 'Maintenance');
    assert.equal(coverageReport(disabled.registry).activeSources, 0);

    const revoked = revokeSource(disabled.registry, 'nasa-news', 'admin:editor', 'Policy review');
    assert.equal(
      revoked.registry.sources.find((s) => s.id === 'nasa-news')?.approval.status,
      'revoked'
    );

    const removed = removeSource(revoked.registry, 'nasa-news', 'admin:editor', 'Archive');
    assert.equal(
      removed.registry.sources.find((s) => s.id === 'nasa-news')?.approval.status,
      'removed'
    );

    const restored = restoreSource(removed.registry, 'nasa-news', 'admin:editor', 'Re-evaluate');
    assert.equal(
      restored.registry.sources.find((s) => s.id === 'nasa-news')?.approval.status,
      'pending'
    );
  });

  it('normalizes URLs by stripping tracking parameters and preserving canonical keys', () => {
    const norm = normalizeUrl(
      'https://www.bbc.co.uk/news/world-12345/?utm_source=x&fbclid=abc&page=2#top'
    );
    assert.ok(norm);
    assert.equal(norm.url, 'https://www.bbc.co.uk/news/world-12345?page=2');
    assert.equal(norm.key, 'bbc.co.uk/news/world-12345?page=2');
  });

  it('classifies priority topics, enforces exclusions, and exempts Tier <= 2 public interest reporting', async () => {
    const registry = await loadRegistry(path.join(CONFIG_DIR, 'sources.json'));
    const policy = await loadPolicy(path.join(CONFIG_DIR, 'policy.json'));
    const bbc = registry.sources.find((s) => s.id === 'bbc-news-world')!;
    const approvedBbc = enableSource(
      approveSource(registry, 'bbc-news-world', 'admin:tester').registry,
      'bbc-news-world',
      'admin:tester'
    ).registry.sources.find((s) => s.id === 'bbc-news-world')!;

    // Soft exclusion waived when Tier <= 2 and matches priority topic (peace/reconstruction)
    const cls = classify(
      policy,
      'Ceasefire talks seek end to bloodshed in Sudan',
      [],
      approvedBbc,
      approvedBbc.endpoints[0]
    );
    assert.equal(cls.category, 'rights-life');
    const ex = evaluateExclusions(
      policy,
      'Ceasefire talks seek end to bloodshed in Sudan',
      approvedBbc,
      cls.topics
    );
    assert.equal(ex.soft.length, 0);
    assert.ok(ex.exempted.includes('gratuitous_violence'));

    // Hard exclusion is never waived
    const gamblingDecision = evaluateEligibility(
      policy,
      approvedBbc,
      approvedBbc.endpoints[0],
      {
        title: 'UK national lottery jackpot reaches record high',
        link: 'https://www.bbc.co.uk/news/lottery-jackpot',
        publishedAt: new Date().toISOString(),
        categories: [],
      },
      approvedBbc.endpoints[0].url,
      new Date()
    );
    assert.equal(gamblingDecision.eligible, false);
    assert.ok(gamblingDecision.reasons.includes('excluded_hard:gambling'));

    // Pending (unapproved) source cannot publish
    const pendingDecision = evaluateEligibility(
      policy,
      bbc,
      bbc.endpoints[0],
      {
        title: 'Clean water infrastructure expands in Kenya',
        link: 'https://www.bbc.co.uk/news/world-africa-1',
        publishedAt: new Date().toISOString(),
        categories: [],
      },
      bbc.endpoints[0].url,
      new Date()
    );
    assert.equal(pendingDecision.eligible, false);
    assert.ok(pendingDecision.reasons.includes('source_not_approved'));

    // Eligible story geotags headline place over source country
    const geo = geotag(policy, 'Clean water infrastructure expands in Kenya', approvedBbc);
    assert.equal(geo.country, 'KE');
    assert.equal(geo.continent, 'Africa');
    assert.equal(geo.by, 'headline_place');
  });

  it('computes headline similarity accurately while ignoring publisher suffixes', () => {
    const score = headlineSimilarity(
      'NASA telescope captures distant exoplanet atmosphere',
      'NASA telescope captures distant exoplanet atmosphere - NASA Science',
      ['nasa', 'science']
    );
    assert.ok(score >= 0.9);
  });
});

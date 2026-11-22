// Automatic publication eligibility. Pure and deterministic: given a collected item and its source,
// decide whether it may be published, and record every reason it may not.
// There is no human-approval step for routine external links.

import type { Continent, Pillar, RawItem, Source, SourceEndpoint } from './types.ts';
import { hostMatchesAny, normalizeUrl, type NormalizedUrl } from './url.ts';
import { classify, evaluateExclusions, geotag, type CompiledPolicy } from './policy.ts';
import { isCollectable } from './registry.ts';

export interface Decision {
  eligible: boolean;
  reasons: string[];
  norm: NormalizedUrl | null;
  headline: string;
  category: Pillar | null;
  classifiedBy: 'keywords' | 'source_default';
  topics: string[];
  country: string;
  continent: Continent;
  geoBy: 'headline_place' | 'source';
  exempted: string[];
  publishedAt: string | null;
  imageUrl: string | null;
  rawCategories: string[];
}

export function evaluateEligibility(
  policy: CompiledPolicy,
  source: Source,
  endpoint: SourceEndpoint,
  raw: RawItem,
  baseUrl: string,
  now: Date
): Decision {
  const p = policy.raw;
  const reasons: string[] = [];
  const headline = raw.title.trim();

  // 1. Source state
  if (source.approval.status !== 'approved') reasons.push('source_not_approved');
  else if (!isCollectable(source)) reasons.push('source_disabled');

  // 2. Link: valid, allowed scheme, belongs to the source's approved domains
  const norm = normalizeUrl(raw.link, baseUrl, {
    trackingParams: p.url.trackingParams,
    trackingPrefixes: p.url.trackingPrefixes,
  });
  if (!norm) {
    reasons.push('link_invalid');
  } else {
    if (norm.scheme === 'http:' && !p.publishing.allowHttp) {
      reasons.push('link_scheme_not_allowed');
    }
    if (!hostMatchesAny(norm.host, source.domains)) {
      reasons.push('link_domain_mismatch');
    }
  }

  // 3. Headline
  if (!headline) reasons.push('headline_missing');
  else if (headline.length < p.publishing.headlineMinChars) reasons.push('headline_too_short');
  else if (headline.length > p.publishing.headlineMaxChars) reasons.push('headline_too_long');

  // 4. Date
  if (raw.publishedAt) {
    const ts = Date.parse(raw.publishedAt);
    const maxAge =
      p.publishing.maxAgeDaysBySourceClass[source.sourceClass] ?? p.publishing.maxAgeDays;
    if (ts > now.getTime() + p.publishing.maxFutureHours * 3_600_000) {
      reasons.push('date_in_future');
    } else if (ts < now.getTime() - maxAge * 86_400_000) {
      reasons.push('date_too_old');
    }
  } else if (!p.publishing.allowMissingDate) {
    reasons.push('date_missing');
  }

  // 5. Classification + exclusions (only meaningful with a headline)
  const rawCategories = source.permittedMetadata.rawCategories ? raw.categories : [];
  const cls = headline
    ? classify(policy, headline, rawCategories, source, endpoint)
    : { category: null, classifiedBy: 'source_default' as const, topics: [] };
  const ex = headline
    ? evaluateExclusions(policy, headline, source, cls.topics)
    : { hard: [], soft: [], exempted: [] };

  for (const id of ex.hard) reasons.push(`excluded_hard:${id}`);
  for (const id of ex.soft) reasons.push(`excluded_soft:${id}`);
  if (headline && !cls.category && p.publishing.requireClassification) {
    reasons.push('unclassified');
  }

  const geo = headline
    ? geotag(policy, headline, source)
    : { country: source.country, continent: source.continent, by: 'source' as const };

  // 6. Media: only when the source's permissions allow it, and only from approved hosts
  let imageUrl: string | null = null;
  if (raw.image && source.permittedMetadata.image && source.mediaPermission !== 'none') {
    const img = normalizeUrl(raw.image, baseUrl, { trackingParams: [], trackingPrefixes: [] });
    if (img && hostMatchesAny(img.host, [...source.domains, ...(source.mediaHosts ?? [])])) {
      imageUrl = img.url;
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    norm,
    headline,
    category: cls.category,
    classifiedBy: cls.classifiedBy,
    topics: cls.topics,
    country: geo.country,
    continent: geo.continent,
    geoBy: geo.by,
    exempted: ex.exempted,
    publishedAt: source.permittedMetadata.publishedAt ? raw.publishedAt : null,
    imageUrl,
    rawCategories,
  };
}

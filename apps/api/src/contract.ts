// Shared Contract for TheOpenSource.news across web, api, pipeline, and growth.

export const CONTRACT_CONTINENTS = [
  'global',
  'africa',
  'asia',
  'europe',
  'north-america',
  'south-america',
  'oceania',
] as const;
export type ContractContinent = (typeof CONTRACT_CONTINENTS)[number];

export const CONTRACT_PILLARS = [
  'progress',
  'opportunity',
  'health-care',
  'rights-life',
  'planet-food',
  'culture-life',
] as const;
export type ContractPillar = (typeof CONTRACT_PILLARS)[number];

export const PILLAR_TO_CATEGORIES: Record<ContractPillar, readonly string[]> = {
  progress: ['human-progress', 'peace-diplomacy', 'science-space'],
  opportunity: ['scholarships', 'jobs-careers', 'grants-startups', 'awards-competitions'],
  'health-care': [
    'healthcare-breakthroughs',
    'mental-wellbeing',
    'elderly-care',
    'disability-inclusion',
  ],
  'rights-life': [
    'civic-benefits',
    'housing-cost-of-living',
    'visas-global-mobility',
    'family-children',
  ],
  'planet-food': ['climate-nature', 'food-agriculture'],
  'culture-life': ['arts-sports-culture'],
};

export const CONTRACT_CATEGORIES = [
  'human-progress',
  'peace-diplomacy',
  'science-space',
  'scholarships',
  'jobs-careers',
  'grants-startups',
  'awards-competitions',
  'healthcare-breakthroughs',
  'mental-wellbeing',
  'elderly-care',
  'disability-inclusion',
  'civic-benefits',
  'housing-cost-of-living',
  'visas-global-mobility',
  'family-children',
  'climate-nature',
  'food-agriculture',
  'arts-sports-culture',
] as const;
export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];

export const CATEGORY_TO_PILLAR: Record<ContractCategory, ContractPillar> = (() => {
  const map = {} as Record<ContractCategory, ContractPillar>;
  for (const [pillar, cats] of Object.entries(PILLAR_TO_CATEGORIES)) {
    for (const c of cats) {
      map[c as ContractCategory] = pillar as ContractPillar;
    }
  }
  return map;
})();

export const VERIFICATION_STATUSES = ['verified', 'held', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type SourcePriority = 1 | 2 | 3 | 4;
export type SourceStatus = 'active' | 'paused' | 'disabled';
export type FeedType = 'rss' | 'atom' | 'sitemap';

export interface RegistrySource {
  source_id: string;
  name: string;
  domain: string;
  country: string | null; // ISO 3166-1 alpha-2 or null
  continent: ContractContinent;
  language: string;
  source_priority: SourcePriority; // Internal only; never exposed in public UI
  feed_url: string;
  feed_type: FeedType;
  license: string;
  logo_permitted: boolean;
  terms_checked_at: string | null;
  robots_ok: boolean;
  status: SourceStatus;
  last_success_at: string | null;
  owner: string;
}

export interface PublicSource {
  source_id: string;
  name: string;
  domain: string;
  country: string | null;
  continent: ContractContinent;
  language: string;
  feed_type: FeedType;
  license: string;
  logo_permitted: boolean;
  status: SourceStatus;
  last_success_at: string | null;
}

export interface AggregatedItem {
  id: string;
  source_id: string;
  source_priority: SourcePriority; // Internal only; stripped before public UI response
  item_index: number;
  cluster_id: string;
  content_hash: string;
  title: string; // Original, unaltered headline
  source_name: string;
  source_logo: string | null; // Only populated if logo_permitted is true
  original_language: string;
  continent: ContractContinent;
  country: string | null; // ISO 3166-1 alpha-2 or null
  pillar: ContractPillar;
  category: ContractCategory;
  published_at: string;
  fetched_at: string;
  deadline_at: string | null; // Strictly from feed metadata or structured data; never guessed
  expires_at: string | null;
  verified_at: string | null;
  recheck_at: string | null;
  canonical_url: string; // Unmodified from feed via item_index
  verification_status: VerificationStatus;
}

export type PublicItem = Omit<AggregatedItem, 'source_priority'>;

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}

export interface KillSwitchState {
  global: boolean;
  sources: Record<string, boolean>;
  categories: Record<string, boolean>;
  updated_at: string;
}

export interface SourceSuggestion {
  id: string;
  name: string;
  domain: string;
  feed_url: string;
  country: string | null;
  notes: string;
  submitted_at: string;
}

export function toPublicItem(item: AggregatedItem): PublicItem {
  const { source_priority: _internalPriority, ...rest } = item;
  return rest;
}

export function toPublicSource(source: RegistrySource): PublicSource {
  return {
    source_id: source.source_id,
    name: source.name,
    domain: source.domain,
    country: source.country,
    continent: source.continent,
    language: source.language,
    feed_type: source.feed_type,
    license: source.license,
    logo_permitted: source.logo_permitted,
    status: source.status,
    last_success_at: source.last_success_at,
  };
}

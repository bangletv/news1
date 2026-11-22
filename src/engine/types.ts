// Shared types and constants for the OSN engine.
// Link-first rule: nothing in this codebase generates, rewrites or summarises content.

export const PILLARS = [
  'progress',
  'opportunity',
  'health-care',
  'rights-life',
  'planet-food',
  'culture-life',
] as const;
export type Pillar = (typeof PILLARS)[number];

export const CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Global',
] as const;
export type Continent = (typeof CONTINENTS)[number];

// Community submissions are a SEPARATE workflow and are deliberately not a source class here.
export const SOURCE_CLASSES = [
  'news_publisher',
  'government',
  'international_org',
  'company_institution',
  'university_research',
] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const COLLECTION_METHODS = ['rss', 'atom', 'news_sitemap', 'api', 'page_metadata'] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];
export const IMPLEMENTED_METHODS: readonly CollectionMethod[] = ['rss', 'atom', 'news_sitemap'];

export type TrustTier = 1 | 2 | 3 | 4;
export type ApprovalStatus = 'pending' | 'approved' | 'revoked' | 'removed';

export interface SourceEndpoint {
  id: string;
  method: CollectionMethod;
  url: string;
  enabled: boolean;
  defaultCategory?: Pillar;
  /** Administrative flag: a human has confirmed this endpoint URL is correct and licensed for use. */
  verified: boolean;
}

export interface PermittedMetadata {
  publishedAt: boolean;
  image: boolean;
  rawCategories: boolean;
}

export interface Source {
  id: string;
  name: string;
  domains: string[];
  /** Hosts allowed for feed/endpoint URLs when they differ from article domains (e.g. feeds.bbci.co.uk). */
  feedHosts?: string[];
  country: string; // ISO 3166-1 alpha-2 or 'GLOBAL'
  continent: Continent;
  sourceClass: SourceClass;
  trustTier: TrustTier;
  enabled: boolean;
  approval: { status: ApprovalStatus; by?: string; at?: string; reason?: string };
  frequencyMinutes: number;
  endpoints: SourceEndpoint[];
  permittedMetadata: PermittedMetadata;
  mediaPermission: 'none' | 'hotlink_with_credit';
  mediaHosts?: string[];
  defaultCategory?: Pillar;
  flags?: string[];
  language?: string;
  notes?: string;
}

export interface Registry {
  schemaVersion: 1;
  sources: Source[];
}

// ---------- Collection ----------

export interface RawItem {
  title: string; // exactly as published (XML-decoded and trimmed only)
  link: string; // as published, may be relative
  publishedAt: string | null; // ISO
  guid?: string;
  image?: string;
  categories: string[];
}

export interface ParsedFeed {
  format: 'rss' | 'atom' | 'news_sitemap';
  items: RawItem[];
  shape: string;
}

export type IntegrityStatus =
  | 'unverified'
  | 'verified'
  | 'unverifiable'
  | 'under_watch'
  | 'suspended'
  | 'removed';

export const ACTIVE_STATUSES: readonly IntegrityStatus[] = [
  'unverified',
  'verified',
  'unverifiable',
  'under_watch',
];

/** Immutable once published. Nothing may change these fields; a hash of them is kept for tamper detection. */
export interface PublishedCore {
  id: string;
  sourceId: string;
  sourceName: string;
  endpointId: string;
  headline: string;
  originalUrl: string;
  canonicalUrl: string;
  canonicalKey: string;
  publishedAt: string | null;
  collectedAt: string;
  country: string;
  continent: Continent;
  geoBy: 'headline_place' | 'source';
  category: Pillar;
  classifiedBy: 'keywords' | 'source_default';
  topics: string[];
  imageUrl: string | null;
  rawCategories: string[];
  clusterId: string | null;
  policyVersion: number;
}

export interface IntegrityState {
  status: IntegrityStatus;
  reason: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  consecutiveFailures: number;
  consecutiveOk: number;
  ambiguousChecks: number;
  observedFinalUrl: string | null;
  observedHeadlines: string[];
  suspendedAt: string | null;
  statusChanges: number;
  imageStatus: 'unchecked' | 'ok' | 'blocked' | 'broken';
  imageReason: string | null;
}

export interface StoredItem {
  core: PublishedCore;
  coreHash: string;
  integrity: IntegrityState;
}

export interface ExclusionRecord {
  id: string;
  at: string;
  sourceId: string;
  endpointId: string;
  headline: string;
  url: string;
  reasons: string[];
}

export interface ExceptionRecord {
  id: string;
  at: string;
  kind: string;
  severity: 'info' | 'warning' | 'error';
  sourceId?: string;
  endpointId?: string;
  itemId?: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string; // admin:<name> | agent:<A|B|C> | system:<component>
  action: string;
  target: { type: 'item' | 'source' | 'policy' | 'agent_config' | 'endpoint'; id: string };
  reason?: string;
  before?: unknown;
  after?: unknown;
}

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AgentId = 'A' | 'B' | 'C';

export interface Finding {
  id: string;
  key: string;
  at: string;
  lastSeenAt: string;
  occurrences: number;
  agent: AgentId;
  severity: Severity;
  type: string;
  itemId?: string;
  sourceId?: string;
  detail: string;
  evidence: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: string;
}

export interface EndpointRuntime {
  key: string; // `${sourceId}#${endpointId}`
  sourceId: string;
  endpointId: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  lastItemCount: number | null;
  recentCounts: number[];
  feedShape: string | null;
  previousFeedShape: string | null;
  feedShapeChangedAt: string | null;
  paused: boolean;
  pausedReason: string | null;
  pausedAt: string | null;
}

export interface ItemFilter {
  status?: readonly IntegrityStatus[];
  sourceId?: string;
  collectedSince?: string;
}

export interface Store {
  getItem(id: string): Promise<StoredItem | undefined>;
  findByCanonicalKey(key: string): Promise<StoredItem | undefined>;
  listItems(filter?: ItemFilter): Promise<StoredItem[]>;
  insertItem(core: PublishedCore): Promise<StoredItem>;
  patchIntegrity(
    id: string,
    patch: Partial<IntegrityState>,
    audit: { actor: string; action: string; reason?: string }
  ): Promise<StoredItem>;
  addExclusion(e: Omit<ExclusionRecord, 'id' | 'at'>): Promise<void>;
  listExclusions(filter?: { sourceId?: string; since?: string }): Promise<ExclusionRecord[]>;
  addException(e: Omit<ExceptionRecord, 'id' | 'at'>): Promise<void>;
  listExceptions(filter?: { kind?: string; sourceId?: string; since?: string }): Promise<ExceptionRecord[]>;
  addAudit(e: Omit<AuditEntry, 'id' | 'at'>): Promise<void>;
  listAudit(filter?: { targetId?: string; actorPrefix?: string }): Promise<AuditEntry[]>;
  addFinding(
    f: Omit<Finding, 'id' | 'key' | 'at' | 'lastSeenAt' | 'occurrences' | 'resolved' | 'resolvedAt'>
  ): Promise<{ finding: Finding; created: boolean }>;
  listFindings(filter?: {
    agent?: AgentId;
    type?: string;
    itemId?: string;
    sourceId?: string;
    resolved?: boolean;
  }): Promise<Finding[]>;
  resolveFindings(filter: {
    agent: AgentId;
    itemId?: string;
    sourceId?: string;
    type?: string;
  }): Promise<number>;
  getRuntime(key: string): Promise<EndpointRuntime | undefined>;
  patchRuntime(
    key: string,
    base: { sourceId: string; endpointId: string },
    patch: Partial<EndpointRuntime>
  ): Promise<EndpointRuntime>;
  listRuntime(): Promise<EndpointRuntime[]>;
  flush(): Promise<void>;
}

// ---------- Network ----------

export interface FetchResult {
  url: string;
  status: number;
  headers: Record<string, string>; // lower-case keys
  body: string;
}

export interface FetchOptions {
  method?: 'GET' | 'HEAD';
  maxBytes?: number;
  headers?: Record<string, string>;
}

export type Fetcher = (url: string, opts?: FetchOptions) => Promise<FetchResult>;
export type Clock = () => Date;

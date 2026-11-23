import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  HeartPulse,
  Image as ImageIcon,
  Landmark,
  Layers,
  Leaf,
  MapPin,
  Orbit,
  Palette,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react';
import {
  CONTRACT_CONTINENTS,
  CONTRACT_PILLARS,
  PILLAR_TO_CATEGORIES,
  type PublicItem,
} from '../../apps/api/src/contract.ts';
import type { LocaleStrings } from '../i18n.ts';
import type { AppTab } from './TopBar.tsx';

export interface ReaderPrefs {
  lang: 'en' | 'bn';
  continent: string;
  pillar: string;
  category: string;
  archive: 'active' | 'closed';
}

interface PublicFeedViewProps {
  sectionMode: 'feed' | 'services' | 'opportunities';
  searchQuery: string;
  onClearSearch: () => void;
  onNavigateTab: (tab: AppTab) => void;
  onVerifiedCountChange?: (count: number) => void;
  prefs: ReaderPrefs;
  onUpdatePrefs: (next: ReaderPrefs) => void;
  strings: LocaleStrings;
}

const PILLAR_ICONS: Record<string, typeof TrendingUp> = {
  progress: TrendingUp,
  opportunity: BriefcaseBusiness,
  'health-care': HeartPulse,
  'rights-life': Scale,
  'planet-food': Leaf,
  'culture-life': Palette,
};

export function PublicFeedView({
  sectionMode,
  searchQuery,
  onClearSearch,
  onNavigateTab,
  onVerifiedCountChange,
  prefs,
  onUpdatePrefs,
  strings,
}: PublicFeedViewProps) {
  const [items, setItems] = useState<PublicItem[]>([]);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sharePreviewId, setSharePreviewId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (prefs.continent !== 'all') params.set('continent', prefs.continent);
    if (sectionMode === 'opportunities') {
      params.set('pillar', 'opportunity');
    } else if (sectionMode === 'feed' && prefs.pillar !== 'all') {
      params.set('pillar', prefs.pillar);
    }
    if (prefs.category !== 'all') params.set('category', prefs.category);
    params.set('archive', prefs.archive);
    params.set('limit', '50');

    fetch(`/api/v1/feed?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Feed request failed');
        return (await res.json()) as {
          items: PublicItem[];
          total_matching: number;
          kill_switch_active: boolean;
        };
      })
      .then((payload) => {
        if (!mounted) return;
        setItems(payload.items);
        setKillSwitchActive(payload.kill_switch_active);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setError('Unable to load verified institutional links.');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [sectionMode, prefs.continent, prefs.pillar, prefs.category, prefs.archive, reloadTick]);

  // Auto-refresh when returning to the tab after 10+ minutes of reading
  useEffect(() => {
    let loadedAt = Date.now();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt >= 10 * 60 * 1000) {
        loadedAt = Date.now();
        setReloadTick((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const handleRefreshLatest = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/v1/feed/refresh', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { verified_count?: number };
        if (typeof data.verified_count === 'number') {
          onVerifiedCountChange?.(data.verified_count);
        }
      }
      setReloadTick((t) => t + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (sectionMode === 'services') {
        if (item.pillar !== 'rights-life' && item.pillar !== 'health-care') return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.source_name.toLowerCase().includes(q) ||
        (item.country ?? '').toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.continent.toLowerCase().includes(q)
      );
    });
  }, [items, sectionMode, searchQuery]);

  const availableCategories = useMemo(() => {
    if (sectionMode === 'opportunities') {
      return [...PILLAR_TO_CATEGORIES.opportunity];
    }
    if (sectionMode === 'services') {
      return [...PILLAR_TO_CATEGORIES['rights-life'], ...PILLAR_TO_CATEGORIES['health-care']];
    }
    if (prefs.pillar !== 'all' && prefs.pillar in PILLAR_TO_CATEGORIES) {
      return [...PILLAR_TO_CATEGORIES[prefs.pillar as keyof typeof PILLAR_TO_CATEGORIES]];
    }
    return Object.values(PILLAR_TO_CATEGORIES).flat();
  }, [sectionMode, prefs.pillar]);

  const formatDate = (isoString: string) =>
    new Date(isoString).toLocaleDateString(prefs.lang === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const todayDisplay = new Date().toLocaleDateString(prefs.lang === 'bn' ? 'bn-BD' : 'en-GB', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const isFilteredFrontPage =
    sectionMode !== 'feed' ||
    searchQuery.trim().length > 0 ||
    prefs.continent !== 'all' ||
    prefs.pillar !== 'all' ||
    prefs.category !== 'all' ||
    prefs.archive === 'closed';

  // Place the highest-ranked / most recently published items strictly at the front space top and in order
  const leadItem = useMemo(() => {
    return filteredItems[0] ?? null;
  }, [filteredItems]);

  const radarItems = useMemo(() => {
    return filteredItems.slice(1, 4);
  }, [filteredItems]);

  const featuredCards = useMemo(() => {
    return filteredItems.slice(4, 7);
  }, [filteredItems]);

  const latestListItems = useMemo(() => {
    if (isFilteredFrontPage) return filteredItems;
    const rest = filteredItems.slice(7);
    return rest.length > 0 ? rest : filteredItems;
  }, [isFilteredFrontPage, filteredItems]);

  const headerEyebrow =
    sectionMode === 'services'
      ? 'PUBLIC INFRASTRUCTURE & HEALTH'
      : sectionMode === 'opportunities'
        ? 'SCHOLARSHIPS, GRANTS & CAREERS'
        : strings.frontPageEyebrow;

  const headerTitle =
    sectionMode === 'services'
      ? strings.navServices
      : sectionMode === 'opportunities'
        ? strings.navOpportunities
        : strings.frontPageTitle;

  const headerSubtitle =
    sectionMode === 'services'
      ? 'Verified public programmes, citizen benefits, housing notices, and healthcare advances.'
      : sectionMode === 'opportunities'
        ? 'Institutional fellowships, research grants, scholarships, and public-sector appointments.'
        : strings.frontPageSubtitle;

  const resetAll = () => {
    onClearSearch();
    onUpdatePrefs({
      ...prefs,
      continent: 'all',
      pillar: 'all',
      category: 'all',
      archive: 'active',
    });
  };

  return (
    <div className="space-y-9" dir={strings.dir}>

      {/* Active Filter Status Pill Bar (when filtered or searching) */}
      {isFilteredFrontPage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d7ded8] bg-white px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-[#506560]">
            <span className="font-semibold text-[#132e30]">
              {filteredItems.length} verified links
            </span>
            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1 rounded bg-[#edf2ed] px-2 py-0.5 font-medium text-[#116351]">
                Search: “{searchQuery.trim()}”
                <button
                  type="button"
                  onClick={onClearSearch}
                  aria-label="Clear search"
                  className="ml-0.5 hover:text-[#132e30]"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {prefs.continent !== 'all' && (
              <span className="rounded bg-[#edf2ed] px-2 py-0.5 font-medium text-[#116351]">
                {strings.continents[prefs.continent] ?? prefs.continent}
              </span>
            )}
            {prefs.pillar !== 'all' && (
              <span className="rounded bg-[#edf2ed] px-2 py-0.5 font-medium text-[#116351]">
                {strings.pillars[prefs.pillar] ?? prefs.pillar}
              </span>
            )}
            {prefs.category !== 'all' && (
              <span className="rounded bg-[#edf2ed] px-2 py-0.5 font-medium text-[#116351]">
                {strings.categories[prefs.category] ?? prefs.category}
              </span>
            )}
            {prefs.archive === 'closed' && (
              <span className="rounded bg-[#fdf4f3] px-2 py-0.5 font-medium text-[#9d4e46]">
                {strings.archiveClosed}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={resetAll}
            className="font-semibold text-[#116351] hover:underline"
          >
            {strings.resetPreferences}
          </button>
        </div>
      )}

      {killSwitchActive && (
        <div
          role="status"
          className="rounded-lg border border-[#9d4e46]/30 bg-white px-5 py-4 text-sm font-medium text-[#9d4e46]"
        >
          {strings.killSwitchNotice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[#9d4e46]/30 bg-white px-5 py-4 text-sm text-[#9d4e46]"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <div className="osn-lead-grid">
            <div className="h-[360px] animate-pulse rounded-md border border-[#d7ded8] bg-white" />
            <div className="h-[360px] animate-pulse rounded-md border border-[#d7ded8] bg-white" />
          </div>
          <div className="osn-cards">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-64 animate-pulse rounded-md border border-[#d7ded8] bg-white" />
            ))}
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-[#d7ded8] bg-white px-6 py-14 text-center">
          <h2 className="font-serif text-2xl font-medium text-[#132e30]">
            {strings.emptyFeedTitle}
          </h2>
          <p className="mt-2 text-sm text-[#506560]">{strings.emptyFeedBody}</p>
          <button
            type="button"
            onClick={resetAll}
            className="mt-5 inline-flex min-h-[40px] items-center rounded-md bg-[#116351] px-4 text-xs font-semibold text-white hover:bg-[#0d4f40]"
          >
            {strings.resetPreferences}
          </button>
        </div>
      ) : (
        <>
          {/* Front Page Hero: Lead Grid + On the Radar */}
          {!isFilteredFrontPage && leadItem && (
            <div className="osn-lead-grid">
              <a
                className="osn-lead group"
                href={`/api/v1/out/${leadItem.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="osn-lead-img"
                  src={`/api/v1/media/${leadItem.id}`}
                  alt={leadItem.title}
                  onError={(e) => {
                    if (!e.currentTarget.src.endsWith(`/api/v1/og/${leadItem.id}.png`)) {
                      e.currentTarget.src = `/api/v1/og/${leadItem.id}.png`;
                    }
                  }}
                />
                <div className="osn-lead-shade" aria-hidden="true" />

                <span className="absolute top-5 left-5 inline-flex items-center gap-2 rounded-[2px] bg-[#112e2e] px-2.5 py-1.5 text-[9px] font-bold tracking-[1.2px] text-white uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ddbc75]" aria-hidden="true" />
                  {strings.featuredDiscovery}
                </span>

                <div className="p-6 pr-16 sm:p-8 sm:pr-20">
                  <div className="flex items-center gap-2 text-[10px] font-bold tracking-[1.6px] uppercase">
                    <span className="text-[#d6f2e9]">
                      {strings.pillars[leadItem.pillar] ?? leadItem.pillar}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{strings.continents[leadItem.continent] ?? leadItem.continent}</span>
                  </div>

                  <h2
                    lang={leadItem.original_language}
                    className="mt-3 max-w-xl font-serif text-[clamp(28px,3.2vw,46px)] font-medium leading-[1.07] tracking-[-0.025em] text-white group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4"
                  >
                    {leadItem.title}
                  </h2>

                  <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[11px] text-[#e6ece8]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#ddbc75]" aria-hidden="true" />
                      {leadItem.source_name}
                    </span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={leadItem.published_at}>{formatDate(leadItem.published_at)}</time>
                  </div>
                </div>

                <span
                  aria-hidden="true"
                  className="absolute right-5 bottom-6 grid h-8 w-8 place-items-center rounded-full border border-white/40 text-white transition-colors group-hover:border-[#ddbc75] group-hover:text-[#ddbc75]"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </a>

              {/* Right: Forest On the Radar */}
              <aside className="osn-radar">
                <h2 className="flex items-center gap-2.5 pb-1 font-serif text-[22px] font-normal tracking-[-0.02em] text-[#f3f5ec]">
                  <Orbit className="h-5 w-5 text-[#ddbc75]" aria-hidden="true" />
                  {strings.onTheRadar}
                </h2>

                <div className="divide-y divide-[#2e4b45]">
                  {radarItems.map((item, idx) => (
                    <a
                      key={item.id}
                      href={`/api/v1/out/${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3.5 py-4"
                    >
                      <span className="font-serif text-xl leading-tight text-[#ddbc75] italic">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <img
                        src={`/api/v1/media/${item.id}`}
                        alt={item.title}
                        loading="lazy"
                        className="mt-0.5 h-14 w-20 shrink-0 rounded border border-white/15 bg-[#1a3e3d] object-cover"
                        onError={(e) => {
                          if (!e.currentTarget.src.endsWith(`/api/v1/og/${item.id}.png`)) {
                            e.currentTarget.src = `/api/v1/og/${item.id}.png`;
                          }
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block text-[9px] font-bold tracking-[1.2px] text-[#ddbc75] uppercase">
                          {strings.pillars[item.pillar] ?? item.pillar}
                        </span>
                        <h3
                          lang={item.original_language}
                          className="mt-1 font-serif text-[16px] font-medium leading-snug text-[#f3f5ec] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-3"
                        >
                          {item.title}
                        </h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[#c5d4ce]">
                          <span className="font-semibold text-[#f3f5ec]">{item.source_name}</span>
                          <span aria-hidden="true">·</span>
                          <time dateTime={item.published_at}>{formatDate(item.published_at)}</time>
                        </div>
                      </div>
                      <ArrowUpRight
                        className="mt-1 h-4 w-4 shrink-0 text-[#ddbc75]"
                        aria-hidden="true"
                      />
                    </a>
                  ))}
                </div>
              </aside>
            </div>
          )}

          {/* Featured Discoveries 3-Column Card Grid */}
          {!isFilteredFrontPage && featuredCards.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="osn-eyebrow">
                    <span className="osn-dash" aria-hidden="true" />
                    {strings.editorialSelection}
                  </div>
                  <h2 className="mt-1.5 font-serif text-[28px] font-normal tracking-[-0.03em] text-[#132e30]">
                    {strings.featuredDiscoveries}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#116351] hover:underline"
                >
                  <span>{strings.viewAll}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="osn-cards">
                {featuredCards.map((item) => {
                  const PillarIcon = PILLAR_ICONS[item.pillar] ?? Layers;
                  return (
                    <article
                      key={item.id}
                      className="group flex flex-col overflow-hidden rounded-[6px] border border-[#d7ded8] bg-white transition-colors hover:border-[#116351]"
                    >
                      <a
                        href={`/api/v1/out/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-1 flex-col"
                      >
                        <div className="relative aspect-[1.9/1] overflow-hidden bg-[#edf2ed]">
                          <img
                            src={`/api/v1/media/${item.id}`}
                            alt={item.title}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            onError={(e) => {
                              if (!e.currentTarget.src.endsWith(`/api/v1/og/${item.id}.png`)) {
                                e.currentTarget.src = `/api/v1/og/${item.id}.png`;
                              }
                            }}
                          />
                          <span className="absolute bottom-3 left-3.5 inline-flex items-center gap-1.5 rounded bg-[#eef7ee] px-2 py-1 text-[10px] font-bold text-[#116351] shadow-xs">
                            <PillarIcon className="h-3 w-3" aria-hidden="true" />
                            {strings.pillars[item.pillar] ?? item.pillar}
                          </span>
                        </div>

                        <div className="flex flex-1 flex-col p-4.5">
                          <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-[1.2px] text-[#506560] uppercase">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            <span>
                              {strings.continents[item.continent] ?? item.continent}
                              {item.country ? ` · ${item.country}` : ''}
                            </span>
                          </div>

                          <h3
                            lang={item.original_language}
                            className="mt-2 font-serif text-[20px] font-medium leading-[1.24] tracking-[-0.02em] text-[#132e30] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-3"
                          >
                            {item.title}
                          </h3>

                          <div className="mt-auto pt-4">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-[#132e30]">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-[#116351]"
                                  aria-hidden="true"
                                />
                                {item.source_name}
                              </span>
                              <ArrowUpRight className="h-3.5 w-3.5 text-[#506560]" aria-hidden="true" />
                            </div>

                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#506560]">
                              <time dateTime={item.published_at}>
                                {formatDate(item.published_at)}
                              </time>
                              {item.deadline_at && (
                                <span className="font-mono text-[10px] font-semibold text-[#9d4e46]">
                                  {strings.closingLabel}: {formatDate(item.deadline_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </a>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* Six Global Pillars Band */}
          {sectionMode === 'feed' && (
            <section className="border-y border-[#d7ded8] py-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-[20px] font-normal tracking-[-0.02em] text-[#132e30]">
                  {strings.exploreSixPillars}
                </h2>
                {prefs.pillar !== 'all' && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdatePrefs({ ...prefs, pillar: 'all', category: 'all' })
                    }
                    className="text-xs font-semibold text-[#116351] hover:underline"
                  >
                    Show all pillars
                  </button>
                )}
              </div>

              <div className="mt-3.5 flex flex-wrap gap-2.5">
                {CONTRACT_PILLARS.map((pillar) => {
                  const Icon = PILLAR_ICONS[pillar] ?? Layers;
                  const active = prefs.pillar === pillar;
                  return (
                    <button
                      key={pillar}
                      type="button"
                      onClick={() =>
                        onUpdatePrefs({
                          ...prefs,
                          pillar: active ? 'all' : pillar,
                          category: 'all',
                        })
                      }
                      className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-[#116351] bg-[#116351] text-white'
                          : 'border-[#d7ded8] bg-white text-[#132e30] hover:border-[#116351]'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${active ? 'text-[#ddbc75]' : 'text-[#116351]'}`}
                        aria-hidden="true"
                      />
                      <span>{strings.pillars[pillar] ?? pillar}</span>
                    </button>
                  );
                })}
              </div>

              {/* Sub-category filter chips when a pillar is active */}
              {prefs.pillar !== 'all' && availableCategories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 pt-1">
                  {availableCategories.map((cat) => {
                    const activeCat = prefs.category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          onUpdatePrefs({ ...prefs, category: activeCat ? 'all' : cat })
                        }
                        className={`rounded border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          activeCat
                            ? 'border-[#112e2e] bg-[#112e2e] text-[#ddbc75]'
                            : 'border-[#d7ded8] bg-[#faf9f6] text-[#506560] hover:border-[#116351] hover:text-[#132e30]'
                        }`}
                      >
                        {strings.categories[cat] ?? cat}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Below Grid: Latest Discoveries + World Index Continent Sidebar */}
          <div className="osn-below">
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-serif text-[26px] font-normal tracking-[-0.025em] text-[#132e30]">
                  {sectionMode === 'services'
                    ? 'Public announcements & services'
                    : sectionMode === 'opportunities'
                      ? 'Open fellowships, grants & roles'
                      : strings.latestDiscoveries}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRefreshLatest()}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#d7ded8] bg-white px-3 py-1.5 text-xs font-semibold text-[#116351] transition-colors hover:border-[#116351] disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{refreshing ? 'Refreshing…' : 'Refresh latest'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#d7ded8] bg-white px-3 py-1.5 text-xs font-semibold text-[#116351] hover:border-[#116351]"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{strings.filtersLabel}</span>
                  </button>
                </div>
              </div>

              {(filtersOpen || sectionMode !== 'feed') && (
                <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-[#d7ded8] bg-white p-4 sm:grid-cols-3">
                  <label className="grid gap-1 text-[11px] font-semibold text-[#506560]">
                    {strings.filterCategory}
                    <select
                      value={prefs.category}
                      onChange={(e) => onUpdatePrefs({ ...prefs, category: e.target.value })}
                      className="min-h-[38px] rounded border border-[#d7ded8] bg-[#faf9f6] px-2.5 text-xs font-medium text-[#132e30]"
                    >
                      <option value="all">{strings.allOption}</option>
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {strings.categories[cat] ?? cat}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-[11px] font-semibold text-[#506560]">
                    {strings.filterArchive}
                    <select
                      value={prefs.archive}
                      onChange={(e) =>
                        onUpdatePrefs({
                          ...prefs,
                          archive: e.target.value === 'closed' ? 'closed' : 'active',
                        })
                      }
                      className="min-h-[38px] rounded border border-[#d7ded8] bg-[#faf9f6] px-2.5 text-xs font-medium text-[#132e30]"
                    >
                      <option value="active">{strings.archiveActive}</option>
                      <option value="closed">{strings.archiveClosed}</option>
                    </select>
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={resetAll}
                      className="min-h-[38px] w-full rounded border border-[#d7ded8] bg-[#faf9f6] px-3 text-xs font-semibold text-[#132e30] hover:border-[#116351]"
                    >
                      {strings.resetPreferences}
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-[#d7ded8] border-t border-[#d7ded8]">
                {latestListItems.map((item) => {
                  return (
                    <div key={item.id} className="py-4">
                      <div className="flex items-start gap-4">
                        <a
                          href={`/api/v1/out/${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 overflow-hidden rounded-md border border-[#d7ded8] bg-[#edf2ed]"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          <img
                            src={`/api/v1/media/${item.id}`}
                            alt={item.title}
                            loading="lazy"
                            className="h-20 w-28 object-cover sm:h-22 sm:w-32"
                            onError={(e) => {
                              if (!e.currentTarget.src.endsWith(`/api/v1/og/${item.id}.png`)) {
                                e.currentTarget.src = `/api/v1/og/${item.id}.png`;
                              }
                            }}
                          />
                        </a>

                        <div className="min-w-0 flex-1">
                          <small className="block text-[11px] font-medium text-[#506560]">
                            {strings.pillars[item.pillar] ?? item.pillar} ·{' '}
                            {strings.categories[item.category] ?? item.category} ·{' '}
                            {strings.continents[item.continent] ?? item.continent}
                            {item.country ? ` (${item.country})` : ''}
                          </small>

                          <h3
                            lang={item.original_language}
                            className="mt-1 font-serif text-[18px] font-medium leading-snug tracking-[-0.015em] text-[#132e30]"
                          >
                            <a
                              href={`/api/v1/out/${item.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline hover:decoration-1 hover:underline-offset-3"
                            >
                              {item.title}
                            </a>
                          </h3>

                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex flex-wrap items-center gap-2 text-[11px] text-[#506560]">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-[#132e30]">
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-[#116351]"
                                  aria-hidden="true"
                                />
                                {item.source_name}
                              </span>
                              <span aria-hidden="true">·</span>
                              <time dateTime={item.published_at}>
                                {formatDate(item.published_at)}
                              </time>
                              {item.deadline_at && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono text-[10px] font-semibold text-[#9d4e46]">
                                    {strings.closingLabel}: {formatDate(item.deadline_at)}
                                  </span>
                                </>
                              )}
                            </span>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setSharePreviewId((prev) => (prev === item.id ? null : item.id))
                                }
                                className="inline-flex items-center gap-1 rounded border border-[#d7ded8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#506560] hover:border-[#116351] hover:text-[#132e30]"
                              >
                                <ImageIcon className="h-3 w-3" aria-hidden="true" />
                                <span>{strings.shareCard}</span>
                              </button>

                              <a
                                href={`/api/v1/out/${item.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Read original from ${item.source_name}`}
                                className="inline-flex items-center gap-1 rounded bg-[#116351] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0d4f40]"
                              >
                                <span>{strings.openOriginal}</span>
                                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>

                      {sharePreviewId === item.id && (
                        <div className="mt-3 ml-0 rounded-lg border border-[#d7ded8] bg-white p-4 sm:ml-[94px]">
                          <p className="mb-2 text-[11px] text-[#506560]">
                            Code-rendered typography share card (/api/v1/og/{item.id}.png)
                          </p>
                          <img
                            src={`/api/v1/og/${item.id}.png`}
                            alt={`Typography share card for ${item.title}`}
                            className="w-full max-w-md rounded border border-[#d7ded8]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Right: World Index Continental Sidebar */}
            <aside className="self-start rounded-xl border border-[#d7ded8] bg-white p-5">
              <div className="osn-eyebrow">
                <span className="osn-dash" aria-hidden="true" />
                {strings.worldIndex}
              </div>
              <h2 className="mt-1.5 font-serif text-[23px] font-normal tracking-[-0.02em] text-[#132e30]">
                {strings.exploreByContinent}
              </h2>

              <div className="mt-4 divide-y divide-[#d7ded8]">
                {CONTRACT_CONTINENTS.map((cont) => {
                  const active = prefs.continent === cont;
                  return (
                    <button
                      key={cont}
                      type="button"
                      onClick={() =>
                        onUpdatePrefs({ ...prefs, continent: active ? 'all' : cont })
                      }
                      className={`flex w-full items-center gap-2.5 py-3 text-left text-xs font-semibold transition-colors ${
                        active ? 'text-[#116351]' : 'text-[#132e30] hover:text-[#116351]'
                      }`}
                    >
                      <MapPin
                        className={`h-4 w-4 ${active ? 'text-[#116351]' : 'text-[#506560]'}`}
                        aria-hidden="true"
                      />
                      <span>{strings.continents[cont] ?? cont}</span>
                      <ArrowRight className="ml-auto h-3.5 w-3.5 text-[#506560]" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-[#d7ded8] pt-4">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePrefs({
                      ...prefs,
                      archive: prefs.archive === 'closed' ? 'active' : 'closed',
                    })
                  }
                  className="flex w-full items-center justify-between rounded-md border border-[#d7ded8] bg-[#faf9f6] px-3 py-2 text-xs font-medium text-[#132e30] hover:border-[#116351]"
                >
                  <span>
                    {prefs.archive === 'closed' ? 'Viewing closed deadlines' : 'View closed deadlines archive'}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#116351]" aria-hidden="true" />
                </button>
              </div>
            </aside>
          </div>

          {/* Three Discovery Gateways */}
          {sectionMode === 'feed' && (
            <section className="osn-gateways pt-2">
              <button
                type="button"
                onClick={() => onNavigateTab('services')}
                className="flex flex-col rounded-xl border border-[#d7ded8] bg-white p-5.5 text-left transition-colors hover:border-[#116351]"
              >
                <Landmark className="h-6 w-6 text-[#116351]" aria-hidden="true" />
                <h2 className="mt-3 font-serif text-[21px] font-medium text-[#132e30]">
                  {strings.navServices}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[#506560]">
                  Official announcements, benefits, housing support, and public programmes.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#116351]">
                  Explore <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('opportunities')}
                className="flex flex-col rounded-xl border border-[#d7ded8] bg-white p-5.5 text-left transition-colors hover:border-[#116351]"
              >
                <BriefcaseBusiness className="h-6 w-6 text-[#116351]" aria-hidden="true" />
                <h2 className="mt-3 font-serif text-[21px] font-medium text-[#132e30]">
                  {strings.navOpportunities}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[#506560]">
                  Employment, scholarships, grants, and institutional fellowships worldwide.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#116351]">
                  Explore <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('community')}
                className="flex flex-col rounded-xl border border-[#d7ded8] bg-white p-5.5 text-left transition-colors hover:border-[#116351]"
              >
                <UsersRound className="h-6 w-6 text-[#116351]" aria-hidden="true" />
                <h2 className="mt-3 font-serif text-[21px] font-medium text-[#132e30]">
                  {strings.navCommunity}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[#506560]">
                  Explore the contribution process and submit an original institutional source.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#116351]">
                  Explore <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>
            </section>
          )}
          {/* Bottom Editorial Edition Banner */}
          <div className="flex flex-col justify-between gap-4 border-t border-[#d7ded8] pt-8 md:flex-row md:items-end">
            <div>
              <div className="osn-eyebrow">
                <span className="osn-dash" aria-hidden="true" />
                {headerEyebrow}
              </div>
              <h1 className="mt-2 font-serif text-[clamp(28px,3.2vw,42px)] font-normal leading-[1.08] tracking-[-0.03em] text-[#132e30]">
                {headerTitle}
              </h1>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#506560]">
                {headerSubtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[#506560]">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#116351]" aria-hidden="true" />
                <time>{todayDisplay}</time>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

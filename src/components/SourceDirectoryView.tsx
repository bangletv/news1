import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Globe2, Search, ShieldCheck } from 'lucide-react';
import { CONTRACT_CONTINENTS, type PublicSource } from '../../apps/api/src/contract.ts';
import type { LocaleStrings } from '../i18n.ts';

interface SourceDirectoryViewProps {
  searchQuery: string;
  selectedContinent: string;
  onOpenSuggest: () => void;
  strings: LocaleStrings;
}

export function SourceDirectoryView({
  searchQuery,
  selectedContinent,
  onOpenSuggest,
  strings,
}: SourceDirectoryViewProps) {
  const [sources, setSources] = useState<PublicSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [continentFilter, setContinentFilter] = useState<string>(selectedContinent);
  const [localQuery, setLocalQuery] = useState(searchQuery);

  useEffect(() => {
    setContinentFilter(selectedContinent);
  }, [selectedContinent]);

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/v1/sources')
      .then((res) => res.json())
      .then((data: { sources?: PublicSource[] }) => {
        if (!mounted) return;
        setSources(data.sources ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = localQuery.trim().toLowerCase();
    return sources.filter((s) => {
      if (continentFilter !== 'all' && s.continent !== continentFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.domain.toLowerCase().includes(q) ||
        (s.country ?? '').toLowerCase().includes(q) ||
        s.license.toLowerCase().includes(q)
      );
    });
  }, [sources, continentFilter, localQuery]);

  return (
    <section className="space-y-8 py-2">
      <header className="flex flex-col justify-between gap-5 border-b border-[#d7ded8] pb-7 md:flex-row md:items-end">
        <div className="max-w-3xl">
          <div className="osn-eyebrow">
            <span className="osn-dash" aria-hidden="true" />
            INSTITUTIONAL REGISTRY
          </div>
          <h1 className="mt-2 font-serif text-4xl font-normal tracking-tight text-[#132e30] sm:text-5xl">
            Source directory
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#506560]">
            Every item published on TheOpenSource.news originates from a registered institutional
            publisher with verified terms and robots.txt compliance. Search aggregators are never
            registered as sources.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSuggest}
          className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-md bg-[#116351] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0e5243]"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          <span>{strings.suggestSource}</span>
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setContinentFilter('all')}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              continentFilter === 'all'
                ? 'border-[#116351] bg-[#116351] text-white'
                : 'border-[#d7ded8] bg-white text-[#132e30] hover:border-[#116351]'
            }`}
          >
            All regions ({sources.length})
          </button>
          {CONTRACT_CONTINENTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setContinentFilter(c)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                continentFilter === c
                  ? 'border-[#116351] bg-[#116351] text-white'
                  : 'border-[#d7ded8] bg-white text-[#132e30] hover:border-[#116351]'
              }`}
            >
              {strings.continents[c] ?? c}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-md border border-[#d7ded8] bg-white px-3 py-2 sm:w-64">
          <Search className="h-3.5 w-3.5 text-[#506560]" aria-hidden="true" />
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Filter publishers..."
            aria-label="Filter registered publishers"
            className="w-full min-w-0 bg-transparent text-xs text-[#132e30] outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-36 animate-pulse rounded-lg border border-[#d7ded8] bg-white" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-[#d7ded8] bg-white p-10 text-center">
          <p className="font-serif text-xl text-[#132e30]">No registered publishers match</p>
          <p className="mt-1 text-sm text-[#506560]">
            Adjust the continent filter or search term, or suggest an institutional source.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((source) => (
            <article
              key={source.source_id}
              className="flex flex-col justify-between rounded-lg border border-[#d7ded8] bg-white p-5 transition-colors hover:border-[#116351]"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold tracking-[1.4px] text-[#116351] uppercase">
                      {strings.continents[source.continent] ?? source.continent}
                      {source.country ? ` · ${source.country}` : ''}
                    </span>
                    <h2 className="mt-1 font-serif text-xl font-medium text-[#132e30]">
                      {source.name}
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded bg-[#edf2ed] px-2 py-1 text-[11px] font-semibold text-[#116351]">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    {source.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#506560]">
                  <span className="inline-flex items-center gap-1 font-mono text-[#132e30]">
                    <Globe2 className="h-3.5 w-3.5 text-[#116351]" aria-hidden="true" />
                    {source.domain}
                  </span>
                  <span>Feed: {source.feed_type.toUpperCase()}</span>
                  <span>Language: {source.language}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#d7ded8]/70 pt-3 text-xs text-[#506560]">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#116351]" aria-hidden="true" />
                  Licence: {source.license}
                </span>
                <span>
                  {source.logo_permitted ? 'Logo permitted' : 'Text attribution only'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

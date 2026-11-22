import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  Earth,
  Landmark,
  Menu,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import { CONTRACT_CONTINENTS } from '../../apps/api/src/contract.ts';
import type { LocaleStrings, UiLanguage } from '../i18n.ts';

export type AppTab =
  | 'feed'
  | 'services'
  | 'opportunities'
  | 'community'
  | 'sources'
  | 'pipeline'
  | 'audit'
  | 'approach';

interface TopBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenSuggest: () => void;
  onOpenCredits: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedContinent: string;
  onContinentChange: (continent: string) => void;
  selectedLang: UiLanguage;
  onLangChange: (lang: UiLanguage) => void;
  totalVerifiedCount: number;
  strings: LocaleStrings;
}

export function TopBar({
  activeTab,
  onSelectTab,
  onOpenSuggest,
  onOpenCredits,
  searchQuery,
  onSearchChange,
  selectedContinent,
  onContinentChange,
  selectedLang,
  onLangChange,
  totalVerifiedCount,
  strings,
}: TopBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const choose = (id: AppTab) => {
    onSelectTab(id);
    setMobileOpen(false);
  };

  const todayFormatted = new Date().toLocaleDateString(
    selectedLang === 'bn' ? 'bn-BD' : 'en-GB',
    {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }
  );

  const primaryTabs: { id: AppTab; label: string; icon: typeof Earth }[] = [
    { id: 'feed', label: strings.navStories, icon: Earth },
    { id: 'services', label: strings.navServices, icon: Landmark },
    { id: 'opportunities', label: strings.navOpportunities, icon: BriefcaseBusiness },
    { id: 'community', label: strings.navCommunity, icon: UsersRound },
  ];

  const utilityTabs: { id: AppTab; label: string }[] = [
    { id: 'pipeline', label: strings.navPipeline },
    { id: 'audit', label: strings.navAudit },
    { id: 'approach', label: strings.navApproach },
  ];

  const activeContinentLabel =
    selectedContinent === 'all'
      ? strings.globalEdition
      : (strings.continents[selectedContinent] ?? selectedContinent);

  return (
    <header className="bg-white">
      <a className="osn-skip" href="#main">
        Skip to content
      </a>

      {/* Forest Edition Strip */}
      <div className="osn-edition-strip">
        <div className="osn-wrap flex min-h-[36px] flex-wrap items-center justify-between gap-3 py-1.5 text-[11px]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-[9px] font-bold tracking-[1.8px] uppercase">
              <Earth className="h-3 w-3 text-[#ddbc75]" aria-hidden="true" />
              {strings.editionBadge}
            </span>
            <span className="hidden text-[#b7c7c2] sm:inline" aria-hidden="true">
              ·
            </span>
            <time className="hidden text-[#e6ece8] sm:inline">{todayFormatted}</time>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <nav className="hidden items-center gap-4 md:flex" aria-label="Editorial governance">
              {utilityTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => choose(tab.id)}
                  className={`text-[11px] font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-[#ddbc75] underline underline-offset-4'
                      : 'text-[#e3ebe7] hover:text-[#ddbc75]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onOpenCredits}
                className="text-[11px] font-medium text-[#e3ebe7] transition-colors hover:text-[#ddbc75]"
              >
                {strings.imageCredits}
              </button>
            </nav>

            <div
              role="group"
              aria-label={strings.languageLabel}
              className="inline-flex items-center rounded border border-[#2c4d4c] bg-[#0c2222] p-0.5 text-[10px]"
            >
              <button
                type="button"
                onClick={() => onLangChange('en')}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  selectedLang === 'en'
                    ? 'bg-[#ddbc75] text-[#112e2e]'
                    : 'text-[#d8e3df] hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onLangChange('bn')}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  selectedLang === 'bn'
                    ? 'bg-[#ddbc75] text-[#112e2e]'
                    : 'text-[#d8e3df] hover:text-white'
                }`}
              >
                বাংলা
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3-Column Editorial Masthead */}
      <div className="osn-wrap grid grid-cols-[1fr_auto_auto] items-center gap-3 py-3.5 md:grid-cols-[1fr_auto_1fr] md:gap-x-7 md:gap-y-2.5 md:py-4.5">
        {/* Left: Edition Index */}
        <div className="hidden items-start gap-1 md:grid">
          <span className="text-[9px] font-bold tracking-[1.8px] text-[#116351] uppercase">
            {strings.editionIndexEyebrow}
          </span>
          <strong className="font-serif text-[26px] font-normal italic leading-tight text-[#132e30]">
            {totalVerifiedCount} verified links
          </strong>
          <div className="flex items-center gap-4">
            <a
              href="#main"
              onClick={() => choose('feed')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#506560] hover:text-[#116351]"
            >
              {strings.exploreEdition}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={onOpenSuggest}
              className="text-xs font-semibold text-[#116351] hover:underline"
            >
              {strings.suggestSource}
            </button>
          </div>
        </div>

        {/* Center: Brand Lockup */}
        <button
          type="button"
          onClick={() => choose('feed')}
          aria-label="TheOpenSource.News home"
          className="col-span-3 justify-self-center md:col-span-1 md:row-span-2"
        >
          <img
            src="/brand-lockup.webp"
            alt="TheOpenSource.News — Open Knowledge. Global News."
            className="block h-auto w-[min(66vw,265px)] md:w-[clamp(220px,22vw,320px)]"
          />
        </button>

        {/* Right Row 1: Continent Edition Selector */}
        <div className="col-start-2 row-start-2 flex items-center justify-end gap-2 md:col-start-3 md:row-start-1">
          <label className="relative inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[#d7ded8] bg-[#faf9f6] px-2.5 text-xs font-semibold text-[#132e30] hover:border-[#116351]">
            <Earth className="h-3.5 w-3.5 text-[#116351]" aria-hidden="true" />
            <span className="hidden sm:inline">{activeContinentLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#506560]" aria-hidden="true" />
            <select
              aria-label="Select edition by continent"
              value={selectedContinent}
              onChange={(e) => {
                onContinentChange(e.target.value);
                if (activeTab !== 'feed' && activeTab !== 'services' && activeTab !== 'opportunities') {
                  onSelectTab('feed');
                }
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              <option value="all">{strings.globalEdition}</option>
              {CONTRACT_CONTINENTS.map((c) => (
                <option key={c} value={c}>
                  {strings.continents[c] ?? c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Right Row 2: Searchbar */}
        <div className="col-start-1 row-start-2 flex items-center gap-2 rounded-full border border-[#d7ded8] bg-[#faf9f6] px-3 py-2 text-[#506560] focus-within:border-[#116351] focus-within:ring-1 focus-within:ring-[#116351] md:col-start-3 md:row-start-2 md:ml-auto md:w-[min(100%,280px)]">
          <Search className="h-4 w-4 shrink-0 text-[#506560]" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Search discoveries"
            placeholder={strings.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              if (
                activeTab !== 'feed' &&
                activeTab !== 'services' &&
                activeTab !== 'opportunities' &&
                activeTab !== 'sources'
              ) {
                onSelectTab('feed');
              }
            }}
            className="w-full min-w-0 bg-transparent text-xs text-[#132e30] placeholder-[#5e6e6a] outline-none sm:text-[13px]"
          />
          <kbd className="hidden rounded border border-[#d7ded8] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#506560] sm:inline-block">
            Ctrl K
          </kbd>
        </div>

        {/* Mobile Menu Trigger */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
          className="col-start-3 row-start-2 inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d7ded8] text-[#132e30] hover:bg-[#edf2ed] md:hidden"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Dark Forest Discovery Navigation Bar */}
      <div className="bg-[#112e2e] text-[#f5f6ed]">
        <nav
          aria-label="Discovery navigation"
          className={`osn-wrap ${
            mobileOpen ? 'grid grid-cols-2 gap-2 py-3' : 'hidden md:flex md:items-center md:gap-7'
          }`}
        >
          {primaryTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => choose(item.id)}
                className={`relative inline-flex min-h-[46px] items-center gap-2 text-[13px] font-semibold transition-colors ${
                  isActive ? 'text-[#ddbc75]' : 'text-[#f5f6ed] hover:text-[#ddbc75]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 bottom-0 left-0 hidden h-[3px] bg-[#ddbc75] md:block"
                  />
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => choose('sources')}
            className={`relative inline-flex min-h-[46px] items-center gap-2 text-[13px] font-semibold transition-colors md:ml-auto ${
              activeTab === 'sources' ? 'text-[#ddbc75]' : 'text-[#f5f6ed] hover:text-[#ddbc75]'
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{strings.navSources}</span>
            {activeTab === 'sources' && (
              <span
                aria-hidden="true"
                className="absolute right-0 bottom-0 left-0 hidden h-[3px] bg-[#ddbc75] md:block"
              />
            )}
          </button>

          {mobileOpen && (
            <>
              {utilityTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => choose(tab.id)}
                  className={`inline-flex min-h-[40px] items-center text-left text-xs font-medium ${
                    activeTab === tab.id ? 'text-[#ddbc75]' : 'text-[#d8e3df]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenSuggest();
                }}
                className="col-span-2 mt-1 inline-flex min-h-[40px] items-center justify-center rounded border border-[#ddbc75] px-3 text-xs font-semibold text-[#ddbc75]"
              >
                {strings.suggestSource}
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

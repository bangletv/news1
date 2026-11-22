import { useEffect, useState } from 'react';
import { TopBar, type AppTab } from './components/TopBar.tsx';
import { PublicFeedView, type ReaderPrefs } from './components/PublicFeedView.tsx';
import { SourceDirectoryView } from './components/SourceDirectoryView.tsx';
import { CommunityVoicesView } from './components/CommunityVoicesView.tsx';
import { PipelineConsoleView } from './components/PipelineConsoleView.tsx';
import { AuditWorkbenchView } from './components/AuditWorkbenchView.tsx';
import { OurApproachView } from './components/OurApproachView.tsx';
import { SuggestSourceModal } from './components/SuggestSourceModal.tsx';
import { InfoDialog } from './components/InfoDialog.tsx';
import { SiteFooter } from './components/SiteFooter.tsx';
import { UI_STRINGS } from './i18n.ts';

const PREFS_STORAGE_KEY = 'osn_reader_prefs_v1';

const DEFAULT_PREFS: ReaderPrefs = {
  lang: 'en',
  continent: 'all',
  pillar: 'all',
  category: 'all',
  archive: 'active',
};

function loadInitialPrefs(): ReaderPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      lang: parsed.lang === 'bn' ? 'bn' : 'en',
      continent: typeof parsed.continent === 'string' ? parsed.continent : 'all',
      pillar: typeof parsed.pillar === 'string' ? parsed.pillar : 'all',
      category: typeof parsed.category === 'string' ? parsed.category : 'all',
      archive: parsed.archive === 'closed' ? 'closed' : 'active',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('feed');
  const [prefs, setPrefs] = useState<ReaderPrefs>(loadInitialPrefs);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalVerifiedCount, setTotalVerifiedCount] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  const strings = UI_STRINGS[prefs.lang];

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage failures in restricted contexts
    }
    document.documentElement.lang = prefs.lang === 'bn' ? 'bn' : 'en-GB';
    document.documentElement.dir = strings.dir;
  }, [prefs, strings.dir]);

  useEffect(() => {
    fetch('/api/v1/stats')
      .then((res) => res.json())
      .then((data: { verified_count?: number; verified_items?: number }) => {
        const count = data.verified_count ?? data.verified_items;
        if (typeof count === 'number') {
          setTotalVerifiedCount(count);
        }
      })
      .catch(() => {
        // Non-blocking stat fetch
      });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f6] text-[#132e30]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSuggest={() => setSuggestOpen(true)}
        onOpenCredits={() => setCreditsOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedContinent={prefs.continent}
        onContinentChange={(continent) => setPrefs((prev) => ({ ...prev, continent }))}
        selectedLang={prefs.lang}
        onLangChange={(lang) => setPrefs((prev) => ({ ...prev, lang }))}
        totalVerifiedCount={totalVerifiedCount}
        strings={strings}
      />

      <main id="main" className="osn-wrap flex-1 py-8 lg:py-11">
        {(activeTab === 'feed' || activeTab === 'services' || activeTab === 'opportunities') && (
          <PublicFeedView
            sectionMode={activeTab}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery('')}
            onNavigateTab={setActiveTab}
            onVerifiedCountChange={setTotalVerifiedCount}
            prefs={prefs}
            onUpdatePrefs={setPrefs}
            strings={strings}
          />
        )}
        {activeTab === 'community' && <CommunityVoicesView />}
        {activeTab === 'sources' && (
          <SourceDirectoryView
            searchQuery={searchQuery}
            selectedContinent={prefs.continent}
            onOpenSuggest={() => setSuggestOpen(true)}
            strings={strings}
          />
        )}
        {activeTab === 'pipeline' && <PipelineConsoleView />}
        {activeTab === 'audit' && <AuditWorkbenchView />}
        {activeTab === 'approach' && <OurApproachView />}
      </main>

      <SuggestSourceModal open={suggestOpen} onClose={() => setSuggestOpen(false)} />
      <InfoDialog open={creditsOpen} onClose={() => setCreditsOpen(false)} />
      <SiteFooter />
    </div>
  );
}

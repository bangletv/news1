export type UiLanguage = 'en' | 'bn';

export interface LocaleStrings {
  dir: 'ltr' | 'rtl';
  navStories: string;
  navServices: string;
  navOpportunities: string;
  navCommunity: string;
  navSources: string;
  navPipeline: string;
  navAudit: string;
  navApproach: string;
  suggestSource: string;
  imageCredits: string;
  editionBadge: string;
  editionIndexEyebrow: string;
  exploreEdition: string;
  searchPlaceholder: string;
  globalEdition: string;
  frontPageEyebrow: string;
  frontPageTitle: string;
  frontPageSubtitle: string;
  featuredDiscovery: string;
  onTheRadar: string;
  editorialSelection: string;
  featuredDiscoveries: string;
  viewAll: string;
  exploreSixPillars: string;
  latestDiscoveries: string;
  filtersLabel: string;
  worldIndex: string;
  exploreByContinent: string;
  filterContinent: string;
  filterPillar: string;
  filterCategory: string;
  filterArchive: string;
  archiveActive: string;
  archiveClosed: string;
  allOption: string;
  resetPreferences: string;
  emptyFeedTitle: string;
  emptyFeedBody: string;
  killSwitchNotice: string;
  openOriginal: string;
  shareCard: string;
  closingLabel: string;
  languageLabel: string;
  pillars: Record<string, string>;
  continents: Record<string, string>;
  categories: Record<string, string>;
}

export const UI_STRINGS: Record<UiLanguage, LocaleStrings> = {
  en: {
    dir: 'ltr',
    navStories: 'Global Stories',
    navServices: 'Public Services',
    navOpportunities: 'Global Opportunities',
    navCommunity: 'Community Voices',
    navSources: 'Source directory',
    navPipeline: 'Pipeline',
    navAudit: 'Audit',
    navApproach: 'Our approach',
    suggestSource: 'Suggest a source',
    imageCredits: 'Image credits',
    editionBadge: 'INTERNATIONAL EDITION',
    editionIndexEyebrow: 'EDITION INDEX',
    exploreEdition: 'Explore this edition',
    searchPlaceholder: 'Search the collection',
    globalEdition: 'Global edition',
    frontPageEyebrow: 'GLOBAL EDITION',
    frontPageTitle: 'The front page',
    frontPageSubtitle:
      'Constructive, institution-sourced headlines and opportunities, linked directly to the original publisher.',
    featuredDiscovery: 'Featured discovery',
    onTheRadar: 'On the radar',
    editorialSelection: 'EDITORIAL SELECTION',
    featuredDiscoveries: 'Featured discoveries',
    viewAll: 'View all',
    exploreSixPillars: 'Explore the six pillars',
    latestDiscoveries: 'Latest discoveries',
    filtersLabel: 'Filters',
    worldIndex: 'WORLD INDEX',
    exploreByContinent: 'Explore by continent',
    filterContinent: 'Continent',
    filterPillar: 'Pillar',
    filterCategory: 'Category',
    filterArchive: 'Status',
    archiveActive: 'Open & current',
    archiveClosed: 'Closed deadlines',
    allOption: 'All',
    resetPreferences: 'Reset preferences',
    emptyFeedTitle: 'No matching verified links',
    emptyFeedBody: 'Adjust your search, continent, or pillar selection, or review closed deadlines.',
    killSwitchNotice: 'Public feed output is temporarily paused by an operational kill switch.',
    openOriginal: 'Read at source',
    shareCard: 'Share card',
    closingLabel: 'Deadline',
    languageLabel: 'Language',
    pillars: {
      progress: 'Progress',
      opportunity: 'Opportunity',
      'health-care': 'Health & Care',
      'rights-life': 'Rights & Life',
      'planet-food': 'Planet & Food',
      'culture-life': 'Culture & Life',
    },
    continents: {
      global: 'Global',
      africa: 'Africa',
      asia: 'Asia',
      europe: 'Europe',
      'north-america': 'North America',
      'south-america': 'South America',
      oceania: 'Oceania',
    },
    categories: {
      'human-progress': 'Human progress',
      'peace-diplomacy': 'Peace & diplomacy',
      'science-space': 'Science & space',
      scholarships: 'Scholarships',
      'jobs-careers': 'Jobs & careers',
      'grants-startups': 'Grants & startups',
      'awards-competitions': 'Awards & competitions',
      'healthcare-breakthroughs': 'Healthcare breakthroughs',
      'mental-wellbeing': 'Mental wellbeing',
      'elderly-care': 'Elderly care',
      'disability-inclusion': 'Disability inclusion',
      'civic-benefits': 'Civic benefits',
      'housing-cost-of-living': 'Housing & cost of living',
      'visas-global-mobility': 'Visas & global mobility',
      'family-children': 'Family & children',
      'climate-nature': 'Climate & nature',
      'food-agriculture': 'Food & agriculture',
      'arts-sports-culture': 'Arts, sports & culture',
    },
  },
  bn: {
    dir: 'ltr',
    navStories: 'বৈশ্বিক সংবাদ',
    navServices: 'জনসেবা',
    navOpportunities: 'বৈশ্বিক সুযোগ',
    navCommunity: 'কমিউনিটি মতামত',
    navSources: 'উৎস তালিকা',
    navPipeline: 'পাইপলাইন',
    navAudit: 'নিরীক্ষা',
    navApproach: 'আমাদের নীতি',
    suggestSource: 'উৎস প্রস্তাব করুন',
    imageCredits: 'ছবির কৃতজ্ঞতা',
    editionBadge: 'আন্তর্জাতিক সংস্করণ',
    editionIndexEyebrow: 'সংস্করণ সূচি',
    exploreEdition: 'সংকলন দেখুন',
    searchPlaceholder: 'সংকলনে খুঁজুন',
    globalEdition: 'বৈশ্বিক সংস্করণ',
    frontPageEyebrow: 'বৈশ্বিক সংস্করণ',
    frontPageTitle: 'প্রথম পাতা',
    frontPageSubtitle:
      'যাচাইকৃত প্রতিষ্ঠান থেকে প্রকাশিত গঠনমূলক সংবাদ ও সুযোগ, সরাসরি মূল উৎসের লিঙ্কসহ।',
    featuredDiscovery: 'বিশেষ সংযোজন',
    onTheRadar: 'নজরে থাকা শিরোনাম',
    editorialSelection: 'সম্পাদকীয় নির্বাচন',
    featuredDiscoveries: 'নির্বাচিত বিষয়সমূহ',
    viewAll: 'সবগুলো দেখুন',
    exploreSixPillars: 'ছয়টি মূল স্তম্ভ দেখুন',
    latestDiscoveries: 'সাম্প্রতিক সংযোজন',
    filtersLabel: 'ফিল্টার',
    worldIndex: 'বিশ্ব সূচি',
    exploreByContinent: 'মহাদেশ অনুযায়ী দেখুন',
    filterContinent: 'মহাদেশ',
    filterPillar: 'বিভাগ',
    filterCategory: 'বিষয়',
    filterArchive: 'অবস্থা',
    archiveActive: 'চলমান ও উন্মুক্ত',
    archiveClosed: 'সময়সীমা উত্তীর্ণ',
    allOption: 'সবগুলো',
    resetPreferences: 'পছন্দ রিসেট করুন',
    emptyFeedTitle: 'কোনো যাচাইকৃত লিঙ্ক পাওয়া যায়নি',
    emptyFeedBody: 'অনুসন্ধান, মহাদেশ বা বিভাগ পরিবর্তন করে দেখুন অথবা সময়সীমা উত্তীর্ণ তালিকা দেখুন।',
    killSwitchNotice: 'প্রশাসনিক কিল-সুইচের মাধ্যমে পাবলিক ফিড সাময়িকভাবে স্থগিত রয়েছে।',
    openOriginal: 'মূল উৎসে পড়ুন',
    shareCard: 'শেয়ার কার্ড',
    closingLabel: 'শেষ তারিখ',
    languageLabel: 'ভাষা',
    pillars: {
      progress: 'অগ্রগতি',
      opportunity: 'সুযোগ',
      'health-care': 'স্বাস্থ্য ও সেবা',
      'rights-life': 'অধিকার ও জীবন',
      'planet-food': 'পৃথিবী ও খাদ্য',
      'culture-life': 'সংস্কৃতি ও জীবন',
    },
    continents: {
      global: 'বৈশ্বিক',
      africa: 'আফ্রিকা',
      asia: 'এশিয়া',
      europe: 'ইউরোপ',
      'north-america': 'উত্তর আমেরিকা',
      'south-america': 'দক্ষিণ আমেরিকা',
      oceania: 'ওশেনিয়া',
    },
    categories: {
      'human-progress': 'মানবিক অগ্রগতি',
      'peace-diplomacy': 'শান্তি ও কূটনীতি',
      'science-space': 'বিজ্ঞান ও মহাকাশ',
      scholarships: 'বৃত্তি ও ফেলোশিপ',
      'jobs-careers': 'কর্মসংস্থান',
      'grants-startups': 'অনুদান ও উদ্যোগ',
      'awards-competitions': 'পুরস্কার ও প্রতিযোগিতা',
      'healthcare-breakthroughs': 'চিকিৎসা উদ্ভাবন',
      'mental-wellbeing': 'মানসিক স্বাস্থ্য',
      'elderly-care': 'প্রবীণ সেবা',
      'disability-inclusion': 'প্রতিবন্ধী অন্তর্ভুক্তি',
      'civic-benefits': 'নাগরিক সুবিধা',
      'housing-cost-of-living': 'আবাসন ও জীবনযাত্রা',
      'visas-global-mobility': 'ভিসা ও অভিবাসন',
      'family-children': 'পরিবার ও শিশু',
      'climate-nature': 'জলবায়ু ও প্রকৃতি',
      'food-agriculture': 'খাদ্য ও কৃষি',
      'arts-sports-culture': 'শিল্প, ক্রীড়া ও সংস্কৃতি',
    },
  },
};

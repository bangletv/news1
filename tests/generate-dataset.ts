import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CONTRACT_CATEGORIES,
  CONTRACT_CONTINENTS,
  type ContractCategory,
  type ContractContinent,
} from '../apps/api/src/contract.ts';

export interface DatasetRow {
  id: string;
  title: string;
  category: ContractCategory;
  continent: ContractContinent;
  source_priority: 1 | 2 | 3 | 4;
  expected_verdict: 'allow' | 'block' | 'unsure';
  case_type: string;
}

const CONSTRUCTIVE_SEEDS: Record<ContractCategory, string[]> = {
  'human-progress': [
    'National literacy programme reaches 200 rural schools with open source learning tablets',
    'Regional electrification grid brings clean water pumping stations to remote villages',
    'Public broadband rollout connects 450 community libraries to digital public infrastructure',
    'Open data portal publishes municipal budget records for citizen transparency',
  ],
  'peace-diplomacy': [
    'Regional mediation talks produce signed peace agreement and cross-border humanitarian corridor',
    'UN agencies coordinate ceasefire monitoring and food assistance for displaced families',
    'Diplomatic dialogue establishes joint water-sharing treaty and reconstruction fund',
    'Humanitarian relief convoy delivers medical aid and winter shelter supplies safely',
  ],
  'science-space': [
    'NASA space mission observatory maps atmospheric water vapour on distant exoplanet',
    'European physics laboratory confirms milestone in clean fusion plasma containment',
    'Joint satellite mission tracks polar glacier thickness with high-resolution radar',
    'Quantum computing research team demonstrates fault-tolerant logical qubit stability',
  ],
  scholarships: [
    'Chevening and Commonwealth postgraduate scholarship programme opens applications for 2026',
    'National science council announces 300 doctoral studentship awards with full tuition grant',
    'University fellowship scheme funds visiting researchers in renewable engineering',
    'Erasmus mobility bursary expands undergraduate exchange scholarships across Europe',
  ],
  'jobs-careers': [
    'Public health institute opens graduate programme and staff engineer vacancies for 2026',
    'National meteorological office announces summer internship and research fellow hiring',
    'Municipal transport authority launches paid civil engineering apprenticeship cohort',
    'International research centre recruits data stewardship specialists on open contracts',
  ],
  'grants-startups': [
    'Innovation fund opens seed funding call for proposals in clean water startups',
    'Research grant programme awards SME funding for agricultural robotics prototypes',
    'Microfinance facility launches low-interest R&D funding for rural cooperatives',
    'National science foundation announces startup grant awards for climate diagnostics',
  ],
  'awards-competitions': [
    'UNESCO literacy prize announces global nominations for community reading centres',
    'Young engineers innovation challenge opens national design competition entries',
    'Public library association unveils shortlist for translated literature literary award',
    'Annual civic data hackathon invites university teams to build accessibility tools',
  ],
  'healthcare-breakthroughs': [
    'WHO approves new thermostable malaria vaccine following multi-country clinical trial',
    'University hospital reports rapid tuberculosis diagnostics breakthrough for rural clinics',
    'Genome sequencing consortium releases open cancer therapy biomarker atlas',
    'Public health centre completes phase three antibiotic trial for resistant infections',
  ],
  'mental-wellbeing': [
    'National health service expands free youth helpline and community mental health clinics',
    'University wellbeing study validates peer counselling support for first-year students',
    'Regional hospital trust launches workplace psychological support and mindfulness programme',
    'Public health ministry funds rural depression care training for primary nurses',
  ],
  'elderly-care': [
    'Municipal council introduces integrated dementia support hubs for older adults',
    'National health institute publishes geriatric nutrition standards for senior living homes',
    'Community elderly care programme expands home physiotherapy visits for pensioners',
    'Public research centre trials assistive mobility sensors for ageing population independence',
  ],
  'disability-inclusion': [
    'University lab releases open-source refreshable Braille display for inclusive education',
    'National broadcaster expands real-time sign language interpretation across civic briefings',
    'Transport ministry funds step-free wheelchair access upgrades at 35 regional stations',
    'School board adopts assistive technology standards for neurodiversity classroom support',
  ],
  'civic-benefits': [
    'Social protection ministry automates child benefit enrolment through public service portal',
    'National legal aid centre expands free tenant advice and citizen entitlement clinics',
    'Digital ID registry introduces offline verification for rural pension reform payments',
    'Municipal government launches transparent civic grant portal for neighbourhood associations',
  ],
  'housing-cost-of-living': [
    'City council approves 1,200 net-zero social housing units under community land trust',
    'Energy regulator introduces winter heating subsidy and targeted bill support for low-income households',
    'Parliament enacts stronger tenant protection and affordable housing rent cap framework',
    'Regional development bank finances energy-efficient insulation retrofits for public housing',
  ],
  'visas-global-mobility': [
    'Government publishes updated skilled worker visa and global talent visa eligibility criteria',
    'Higher education authority extends post-study work permit window for STEM graduates',
    'Bilateral mobility scheme opens youth exchange visa route between partner countries',
    'Interior ministry digitises passport renewal and asylum integration documentation',
  ],
  'family-children': [
    'Ministry of education expands universal free school meals to 800 primary schools',
    'Public health agency strengthens maternal health clinics and early childhood nutrition visits',
    'National employment act extends paid parental leave and affordable childcare subsidies',
    'Municipal libraries launch bilingual early childhood literacy and family support sessions',
  ],
  'climate-nature': [
    'Coastal conservation authority restores 12,000 hectares of mangrove wetland habitat',
    'National grid operator hits record renewable solar and wind power generation share',
    'Marine science agency documents coral reef recovery inside protected ocean sanctuary',
    'Forestry commission partners with municipalities on urban reforestation and emissions reduction',
  ],
  'food-agriculture': [
    'Agricultural research institute releases drought-resistant millet varieties to boost food security',
    'Rural irrigation cooperative doubles smallholder crop yield using solar drip systems',
    'Seed bank coalition archives 4,000 heirloom grain accessions for climate resilience',
    'Sustainable farming board certifies community fisheries for long-term coastal stewardship',
  ],
  'arts-sports-culture': [
    'National museum opens free digitised archive of regional manuscript heritage and folk music',
    'UNESCO inscribes traditional boatbuilding craft on intangible cultural heritage list',
    'Community sport foundation builds inclusive Paralympic athletics centre in northern district',
    'Public arts council funds touring regional orchestra and free summer cultural festival',
  ],
};

const HARD_BLOCK_HEADLINES: { title: string; category: ContractCategory; case_type: string }[] = [
  {
    title: 'Airstrike and shelling leave dozens of casualties near border town',
    category: 'peace-diplomacy',
    case_type: 'conflict_casualties',
  },
  {
    title: 'Fatal crash and multi-vehicle pile-up kills four commuters on motorway',
    category: 'human-progress',
    case_type: 'accident_fatal',
  },
  {
    title: 'Armed robbery suspect arrested after dramatic police manhunt and shooting',
    category: 'civic-benefits',
    case_type: 'crime_report',
  },
  {
    title: 'Analysts warn of World War 3 and nuclear apocalypse brinkmanship',
    category: 'peace-diplomacy',
    case_type: 'war_fear',
  },
  {
    title: 'Opposition leader slams rival as corrupt in heated partisan showdown',
    category: 'civic-benefits',
    case_type: 'partisan_attack',
  },
  {
    title: 'Unconfirmed report and insiders claim celebrity dating rumour after leaked photos',
    category: 'arts-sports-culture',
    case_type: 'rumour_gossip',
  },
  {
    title: 'Adult film studio faces inquiry over explicit NSFW subscription content',
    category: 'arts-sports-culture',
    case_type: 'adult_content',
  },
  {
    title: 'Horror stabbing and bloodshed reported outside downtown nightclub',
    category: 'housing-cost-of-living',
    case_type: 'violence_bloodshed',
  },
  {
    title: 'Drug cartel shootout leaves three dead in coastal province',
    category: 'human-progress',
    case_type: 'crime_violence',
  },
  {
    title: 'Election smear campaign escalates with political attack ad accusations',
    category: 'civic-benefits',
    case_type: 'partisan_politics',
  },
];

const HARD_UNSURE_HEADLINES: {
  title: string;
  category: ContractCategory;
  priority: 1 | 2 | 3 | 4;
  case_type: string;
}[] = [
  {
    title: 'International scholarship agency offers 100% guaranteed admission with processing fee required',
    category: 'scholarships',
    priority: 2,
    case_type: 'scholarship_fee_scam',
  },
  {
    title: 'Global agency promotes guaranteed visa and instant job placement for wire fee',
    category: 'visas-global-mobility',
    priority: 2,
    case_type: 'visa_scam',
  },
  {
    title: 'Secret remedy doctors hide promises miracle cure that cures all cancer overnight',
    category: 'healthcare-breakthroughs',
    priority: 4,
    case_type: 'miracle_cure_claim',
  },
  {
    title: 'Unverified herbal tonic advertised as anti-aging miracle and guaranteed weight loss pill',
    category: 'elderly-care',
    priority: 4,
    case_type: 'exaggerated_medical_claim',
  },
  {
    title: 'Quarterly administrative notice released regarding internal committee schedule',
    category: 'human-progress',
    priority: 1,
    case_type: 'ambiguous_generic_notice',
  },
];

const CONTINENT_LOCATIONS: Record<ContractContinent, string[]> = {
  global: ['worldwide', 'across partner nations', 'globally'],
  africa: ['in Kenya', 'across Ethiopia', 'in Nigeria'],
  asia: ['in Bangladesh', 'across India', 'in Japan'],
  europe: ['in the United Kingdom', 'across Germany', 'in France'],
  'north-america': ['in the United States', 'across Canada', 'in Toronto'],
  'south-america': ['in Chile', 'across Brazil', 'in Colombia'],
  oceania: ['in Australia', 'across New Zealand', 'in the Pacific'],
};

const rows: DatasetRow[] = [];
let seq = 1;

// Generate 24 constructive rows per category across all 7 continents (18 * 24 = 432 allow rows)
for (const category of CONTRACT_CATEGORIES) {
  const templates = CONSTRUCTIVE_SEEDS[category];
  for (let i = 0; i < 24; i++) {
    const continent = CONTRACT_CONTINENTS[(i + seq) % CONTRACT_CONTINENTS.length];
    const loc = CONTINENT_LOCATIONS[continent][i % CONTINENT_LOCATIONS[continent].length];
    const base = templates[i % templates.length];
    const priority: 1 | 2 | 3 | 4 =
      category === 'scholarships' || category === 'jobs-careers' || category === 'visas-global-mobility'
        ? (((i % 3) + 1) as 1 | 2 | 3)
        : category.includes('health') || category.includes('care') || category.includes('wellbeing') || category.includes('disability')
          ? ([1, 2, 4][i % 3] as 1 | 2 | 4)
          : (((i % 4) + 1) as 1 | 2 | 3 | 4);

    rows.push({
      id: `sb_${String(seq++).padStart(4, '0')}`,
      title: `${base} (${loc})`,
      category,
      continent,
      source_priority: priority,
      expected_verdict: 'allow',
      case_type: 'constructive_positive',
    });
  }
}

// Add 80 hard blocked cases across continents (432 + 80 = 512)
for (let i = 0; i < 80; i++) {
  const sample = HARD_BLOCK_HEADLINES[i % HARD_BLOCK_HEADLINES.length];
  const continent = CONTRACT_CONTINENTS[i % CONTRACT_CONTINENTS.length];
  const loc = CONTINENT_LOCATIONS[continent][i % 3];
  rows.push({
    id: `sb_${String(seq++).padStart(4, '0')}`,
    title: `${sample.title} ${loc}`,
    category: sample.category,
    continent,
    source_priority: 1,
    expected_verdict: 'block',
    case_type: sample.case_type,
  });
}

// Add 40 hard unsure/hold edge cases (512 + 40 = 552 total headlines)
for (let i = 0; i < 40; i++) {
  const sample = HARD_UNSURE_HEADLINES[i % HARD_UNSURE_HEADLINES.length];
  const continent = CONTRACT_CONTINENTS[i % CONTRACT_CONTINENTS.length];
  rows.push({
    id: `sb_${String(seq++).padStart(4, '0')}`,
    title: `${sample.title} — case ${i + 1}`,
    category: sample.category,
    continent,
    source_priority: sample.priority,
    expected_verdict: 'unsure',
    case_type: sample.case_type,
  });
}

const outPath = path.resolve(process.cwd(), 'tests/sea-beach-dataset.json');
writeFileSync(outPath, JSON.stringify({ version: 1, count: rows.length, items: rows }, null, 2) + '\n');
console.log(`Generated ${rows.length} labelled Sea Beach headlines at ${outPath}`);

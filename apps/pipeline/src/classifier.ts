import { GoogleGenAI, Type } from '@google/genai';
import {
  CATEGORY_TO_PILLAR,
  CONTRACT_CATEGORIES,
  CONTRACT_CONTINENTS,
  CONTRACT_PILLARS,
  type ContractCategory,
  type ContractContinent,
  type ContractPillar,
  type RegistrySource,
  type SourcePriority,
} from '../../api/src/contract.ts';

export type SeaBeachVerdict = 'allow' | 'block' | 'unsure';

export interface ClassifierInput {
  item_index: number;
  title: string; // Never pass URLs to the classifier model
  source_name: string;
  source_priority: SourcePriority;
  source_continent: ContractContinent;
  source_country: string | null;
}

export interface ClassificationOutput {
  item_index: number;
  pillar: ContractPillar;
  category: ContractCategory;
  continent: ContractContinent;
  country: string | null;
  sea_beach_verdict: SeaBeachVerdict;
  provider: string;
  held_reason?: string;
}

export interface CostMetrics {
  calls: number;
  estimated_usd: number;
  monthly_cap_usd: number;
  per_item_cap_usd: number;
}

export interface ClassifierProvider {
  readonly name: string;
  classify(input: ClassifierInput): Promise<ClassificationOutput>;
}

// ---------- Sea Beach & Honey-Bee Deterministic Rules ----------

const BLOCKED_SEA_BEACH_PATTERNS: { reason: string; rx: RegExp }[] = [
  {
    reason: 'violence_or_casualties',
    rx: /\b(killed|dead|deaths|casualties|airstrike|bombing|massacre|shooting|stabbing|murder|homicide|bloodshed|gruesome|decapitat\w*|mutilat\w*|shelling|casualty toll|gunfire|terror attack|suicide bomb)\b/i,
  },
  {
    reason: 'accidents_and_disasters_gore',
    rx: /\b(fatal crash|pile-up|derailment kills|plane crash kills|bus plunge|industrial explosion kills|body parts)\b/i,
  },
  {
    reason: 'crime_reports',
    rx: /\b(serial killer|true crime|arrested for murder|armed robbery|drug cartel|gang shootout|kidnapping|arson suspect|manhunt)\b/i,
  },
  {
    reason: 'war_fear_escalation',
    rx: /\b(world war 3|world war iii|nuclear apocalypse|doomsday|brink of nuclear war|total annihilation|imminent invasion threat)\b/i,
  },
  {
    reason: 'partisan_politics',
    rx: /\b(slams rival|blasts opposition|political attack ad|election smear|partisan showdown|scandal rocks party|calls opponent corrupt|voter fraud conspiracy)\b/i,
  },
  {
    reason: 'rumours_and_gossip',
    rx: /\b(rumour|rumor|unconfirmed report|insiders claim|celebrity scandal|red carpet wardrobe|leaked photos|dating rumour|net worth)\b/i,
  },
  {
    reason: 'adult_explicit',
    rx: /\b(xxx|nsfw|onlyfans|porn\w*|adult film|sex tape|erotic)\b/i,
  },
];

// Hard/ambiguous safety checks: fee scams, guaranteed outcomes, miracle cure claims
const SUSPICIOUS_OPPORTUNITY_RX =
  /\b(processing fee required|pay to apply|guaranteed visa|guaranteed job|100% guaranteed admission|no experience instant visa|registration fee for scholarship|wire fee)\b/i;

const EXAGGERATED_MEDICAL_RX =
  /\b(miracle cure|cures all cancer|100% effective instant cure|secret remedy doctors hide|guaranteed weight loss pill|reverses aging overnight|anti-aging miracle)\b/i;

const CONSTRUCTIVE_PEACE_ALLOW_RX =
  /\b(peace agreement|peace treaty|ceasefire|humanitarian corridor|humanitarian relief|aid convoy|diplomatic dialogue|reconstruction fund|medical aid|refugee shelter|mediation talks|food assistance)\b/i;

const CATEGORY_KEYWORDS: { category: ContractCategory; rx: RegExp }[] = [
  {
    category: 'scholarships',
    rx: /\b(scholarship|fellowship|bursary|tuition grant|doctoral funding|postgraduate award|studentship|erasmus|chevening|fulbright)\b/i,
  },
  {
    category: 'jobs-careers',
    rx: /\b(vacancy|vacancies|careers|hiring|apprenticeship|internship|fellowship position|graduate programme|staff engineer|research fellow)\b/i,
  },
  {
    category: 'grants-startups',
    rx: /\b(research grant|seed funding|startup grant|innovation fund|call for proposals|venture grant|microfinance|sme funding|r&d funding|icure|commercialisation)\b/i,
  },
  {
    category: 'awards-competitions',
    rx: /\b(prize|award nominations|innovation challenge|essay competition|hackathon|literary award|medal|fellows honoured)\b/i,
  },
  {
    category: 'healthcare-breakthroughs',
    rx: /\b(vaccine|clinical trial|malaria|tuberculosis|cancer therapy|diagnostics|who approves|medical breakthrough|genome sequencing|antibiotic|technical package|health data)\b/i,
  },
  {
    category: 'mental-wellbeing',
    rx: /\b(mental health|wellbeing|well-being|counselling|psychological support|depression care|youth helpline|mindfulness programme)\b/i,
  },
  {
    category: 'elderly-care',
    rx: /\b(elderly care|older adults|dementia support|ageing population|geriatric|pensioner care|senior living)\b/i,
  },
  {
    category: 'disability-inclusion',
    rx: /\b(disability|accessibility|assistive technology|braille|sign language|inclusive education|wheelchair access|neurodiversity)\b/i,
  },
  {
    category: 'civic-benefits',
    rx: /\b(public service|social protection|child benefit|pension reform|digital id|civic grant|citizen entitlement|legal aid|welfare support)\b/i,
  },
  {
    category: 'housing-cost-of-living',
    rx: /\b(affordable housing|social housing|rent cap|energy bill support|cost of living|heating subsidy|tenant protection|community land trust)\b/i,
  },
  {
    category: 'visas-global-mobility',
    rx: /\b(visa route|work permit|global talent visa|digital nomad visa|skilled worker visa|mobility scheme|passport renewal|asylum integration)\b/i,
  },
  {
    category: 'family-children',
    rx: /\b(childcare|parental leave|maternal health|early childhood|school meals|youth programme|family support|child nutrition|give birth)\b/i,
  },
  {
    category: 'climate-nature',
    rx: /\b(climate|renewable|solar|wind power|biodiversity|reforestation|mangrove|coral reef|emissions reduction|clean energy|glacier|wetland)\b/i,
  },
  {
    category: 'food-agriculture',
    rx: /\b(agriculture|harvest|drought-resistant|crop yield|food security|sustainable farming|irrigation|fisheries|soil health|seed bank)\b/i,
  },
  {
    category: 'arts-sports-culture',
    rx: /\b(museum|heritage|unesco|festival|library|archive|orchestra|traditional music|olympic|paralympic|community sport|exhibition|word of the year|dictionary)\b/i,
  },
  {
    category: 'peace-diplomacy',
    rx: /\b(peace agreement|ceasefire|diplomatic|treaty|mediation|humanitarian|reconciliation|cross-border cooperation|un resolution|rohingya|refugee)\b/i,
  },
  {
    category: 'science-space',
    rx: /\b(telescope|exoplanet|mars|jupiter|mercury|bepicolombo|juno|apod|satellite|space mission|quantum|physics|observatory|fusion|particle|superconducting|nasa|esa)\b/i,
  },
  {
    category: 'human-progress',
    rx: /\b(literacy|electrification|clean water|broadband|open source|digital public infrastructure|poverty reduction|education access)\b/i,
  },
];

const PLACE_HINTS: { rx: RegExp; continent: ContractContinent; country: string | null }[] = [
  { rx: /\b(bangladesh|dhaka|chattogram)\b/i, continent: 'asia', country: 'BD' },
  { rx: /\b(india|new delhi|mumbai)\b/i, continent: 'asia', country: 'IN' },
  { rx: /\b(japan|tokyo)\b/i, continent: 'asia', country: 'JP' },
  { rx: /\b(indonesia|jakarta)\b/i, continent: 'asia', country: 'ID' },
  { rx: /\b(united kingdom|britain|british|london|oxford|ukri|nhs)\b/i, continent: 'europe', country: 'GB' },
  { rx: /\b(germany|berlin)\b/i, continent: 'europe', country: 'DE' },
  { rx: /\b(france|paris)\b/i, continent: 'europe', country: 'FR' },
  { rx: /\b(european union|brussels|europe)\b/i, continent: 'europe', country: null },
  { rx: /\b(kenya|nairobi)\b/i, continent: 'africa', country: 'KE' },
  { rx: /\b(nigeria|lagos|abuja)\b/i, continent: 'africa', country: 'NG' },
  { rx: /\b(south africa|cape town)\b/i, continent: 'africa', country: 'ZA' },
  { rx: /\b(ethiopia|addis ababa|african union)\b/i, continent: 'africa', country: 'ET' },
  { rx: /\b(africa|african)\b/i, continent: 'africa', country: null },
  { rx: /\b(united states|u\.s\.|nasa|mit|washington)\b/i, continent: 'north-america', country: 'US' },
  { rx: /\b(canada|ottawa|toronto)\b/i, continent: 'north-america', country: 'CA' },
  { rx: /\b(brazil|brasilia|amazon)\b/i, continent: 'south-america', country: 'BR' },
  { rx: /\b(chile|santiago|eclac)\b/i, continent: 'south-america', country: 'CL' },
  { rx: /\b(colombia|bogota)\b/i, continent: 'south-america', country: 'CO' },
  { rx: /\b(australia|csiro|sydney|melbourne)\b/i, continent: 'oceania', country: 'AU' },
  { rx: /\b(new zealand|fiji|pacific)\b/i, continent: 'oceania', country: 'NZ' },
];

export function applySafetyAndPriorityGates(
  input: ClassifierInput,
  category: ContractCategory,
  verdict: SeaBeachVerdict
): { verdict: SeaBeachVerdict; held_reason?: string } {
  const title = input.title;

  for (const rule of BLOCKED_SEA_BEACH_PATTERNS) {
    if (rule.rx.test(title)) {
      if (
        rule.reason === 'violence_or_casualties' &&
        CONSTRUCTIVE_PEACE_ALLOW_RX.test(title) &&
        !/\b(killed|dead|deaths|casualties|massacre|bombing|airstrike|shooting)\b/i.test(title)
      ) {
        continue;
      }
      return { verdict: 'block', held_reason: `sea_beach:${rule.reason}` };
    }
  }

  if (
    category === 'scholarships' ||
    category === 'jobs-careers' ||
    category === 'visas-global-mobility'
  ) {
    if (![1, 2, 3].includes(input.source_priority)) {
      return { verdict: 'unsure', held_reason: 'priority_gate_opportunity' };
    }
    if (SUSPICIOUS_OPPORTUNITY_RX.test(title)) {
      return { verdict: 'unsure', held_reason: 'suspicious_fee_or_guarantee_claim' };
    }
  }

  const pillar = CATEGORY_TO_PILLAR[category];
  if (pillar === 'health-care') {
    if (![1, 2, 4].includes(input.source_priority)) {
      return { verdict: 'unsure', held_reason: 'priority_gate_health' };
    }
    if (EXAGGERATED_MEDICAL_RX.test(title)) {
      return { verdict: 'unsure', held_reason: 'exaggerated_medical_claim' };
    }
  }

  if (verdict === 'unsure') {
    return { verdict: 'unsure', held_reason: 'classifier_unsure' };
  }

  return { verdict };
}

export class DeterministicClassifierProvider implements ClassifierProvider {
  readonly name = 'deterministic-policy-v1';

  async classify(input: ClassifierInput): Promise<ClassificationOutput> {
    const title = input.title;

    let matchedCategory: ContractCategory | null = null;
    for (const rule of CATEGORY_KEYWORDS) {
      if (rule.rx.test(title)) {
        matchedCategory = rule.category;
        break;
      }
    }

    const category: ContractCategory = matchedCategory ?? 'human-progress';
    const pillar: ContractPillar = CATEGORY_TO_PILLAR[category];

    let continent: ContractContinent = input.source_continent;
    let country: string | null = input.source_country;
    for (const hint of PLACE_HINTS) {
      if (hint.rx.test(title)) {
        continent = hint.continent;
        country = hint.country;
        break;
      }
    }

    const gated = applySafetyAndPriorityGates(
      input,
      category,
      matchedCategory ? 'allow' : 'allow'
    );

    // If no blocked rule triggered and no category matched at all, hold ambiguous headlines unless clearly constructive
    let finalVerdict = gated.verdict;
    let heldReason = gated.held_reason;
    if (finalVerdict === 'allow' && !matchedCategory) {
      finalVerdict = 'unsure';
      heldReason = 'no_constructive_category_match';
    }

    return {
      item_index: input.item_index,
      pillar,
      category,
      continent,
      country,
      sea_beach_verdict: finalVerdict,
      provider: this.name,
      held_reason: heldReason,
    };
  }
}

export class GeminiClassifierProvider implements ClassifierProvider {
  readonly name = 'gemini-4-hydrogen';
  private readonly ai: GoogleGenAI;
  private readonly metrics: CostMetrics;

  constructor(
    apiKey: string,
    caps: { monthlyCapUsd?: number; perItemCapUsd?: number } = {}
  ) {
    this.ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });
    this.metrics = {
      calls: 0,
      estimated_usd: 0,
      monthly_cap_usd: caps.monthlyCapUsd ?? 25,
      per_item_cap_usd: caps.perItemCapUsd ?? 0.005,
    };
  }

  getMetrics(): CostMetrics {
    return { ...this.metrics };
  }

  async classify(input: ClassifierInput): Promise<ClassificationOutput> {
    if (this.metrics.estimated_usd + 0.0005 > this.metrics.monthly_cap_usd) {
      throw new Error('Monthly classifier cost cap reached');
    }

    const prompt = [
      'Classify the following headline strictly using the JSON schema enums.',
      'Do NOT invent, edit, or return any URL. Do NOT rewrite or summarise the headline.',
      'Sea Beach policy: block accidents, bloodshed, violence, crime reports, war fear, partisan politics, rumours, or adult content. Allow peace agreements, humanitarian programmes, and constructive opportunities. Return unsure if ambiguous.',
      `Headline: ${JSON.stringify(input.title)}`,
      `Source: ${JSON.stringify(input.source_name)}`,
      `Default continent: ${input.source_continent}`,
    ].join('\n');

    const response = await this.ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a strict JSON classifier. Output only enum values defined in the schema. Never generate prose or URLs.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pillar: {
              type: Type.STRING,
              enum: [...CONTRACT_PILLARS],
            },
            category: {
              type: Type.STRING,
              enum: [...CONTRACT_CATEGORIES],
            },
            continent: {
              type: Type.STRING,
              enum: [...CONTRACT_CONTINENTS],
            },
            country: {
              type: Type.STRING,
              nullable: true,
            },
            sea_beach_verdict: {
              type: Type.STRING,
              enum: ['allow', 'block', 'unsure'],
            },
          },
          required: ['pillar', 'category', 'continent', 'sea_beach_verdict'],
        },
      },
    });

    this.metrics.calls += 1;
    this.metrics.estimated_usd += 0.0004;

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText) as {
      pillar?: string;
      category?: string;
      continent?: string;
      country?: string | null;
      sea_beach_verdict?: string;
    };

    if (
      !CONTRACT_CATEGORIES.includes(parsed.category as ContractCategory) ||
      !CONTRACT_CONTINENTS.includes(parsed.continent as ContractContinent) ||
      !['allow', 'block', 'unsure'].includes(String(parsed.sea_beach_verdict))
    ) {
      return {
        item_index: input.item_index,
        pillar: 'progress',
        category: 'human-progress',
        continent: input.source_continent,
        country: input.source_country,
        sea_beach_verdict: 'unsure',
        provider: this.name,
        held_reason: 'invalid_model_enum_output',
      };
    }

    const category = parsed.category as ContractCategory;
    const pillar = CATEGORY_TO_PILLAR[category];
    const continent = parsed.continent as ContractContinent;
    const country =
      parsed.country && /^[A-Z]{2}$/.test(parsed.country)
        ? parsed.country
        : input.source_country;

    const gated = applySafetyAndPriorityGates(
      input,
      category,
      parsed.sea_beach_verdict as SeaBeachVerdict
    );

    return {
      item_index: input.item_index,
      pillar,
      category,
      continent,
      country,
      sea_beach_verdict: gated.verdict,
      provider: this.name,
      held_reason: gated.held_reason,
    };
  }
}

export class ChainedClassifier {
  private readonly providers: ClassifierProvider[];

  constructor(providers: ClassifierProvider[]) {
    this.providers = providers;
  }

  async classifyWithFallback(input: ClassifierInput): Promise<ClassificationOutput> {
    for (const provider of this.providers) {
      try {
        return await provider.classify(input);
      } catch {
        continue;
      }
    }
    // If every provider fails, hold rather than publish unclassified items
    return {
      item_index: input.item_index,
      pillar: 'progress',
      category: 'human-progress',
      continent: input.source_continent,
      country: input.source_country,
      sea_beach_verdict: 'unsure',
      provider: 'fail-closed-hold',
      held_reason: 'all_providers_unavailable',
    };
  }
}

export function buildDefaultClassifier(geminiApiKey?: string): ChainedClassifier {
  const providers: ClassifierProvider[] = [];
  if (geminiApiKey && geminiApiKey.trim() && geminiApiKey !== 'MY_GEMINI_API_KEY') {
    providers.push(new GeminiClassifierProvider(geminiApiKey.trim()));
  }
  providers.push(new DeterministicClassifierProvider());
  return new ChainedClassifier(providers);
}

export function toClassifierInput(
  source: RegistrySource,
  item_index: number,
  title: string
): ClassifierInput {
  return {
    item_index,
    title,
    source_name: source.name,
    source_priority: source.source_priority,
    source_continent: source.continent,
    source_country: source.country,
  };
}

import type { Continent } from './types.ts';

// ISO 3166-1 alpha-2 -> continent. Borderline cases (e.g. CY, TR, GE, AM, AZ, KZ, RU) follow common
// editorial convention. A source's explicit `continent` field wins; mismatches only raise a warning.
const BY_CONTINENT: Record<Exclude<Continent, 'Global'>, string> = {
  Africa:
    'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH',
  Asia:
    'AF AM AZ BH BD BT BN KH CN GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TJ TH TL TR TM AE UZ VN YE TW HK MO',
  Europe:
    'AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA',
  'North America':
    'AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US',
  'South America':
    'AR BO BR CL CO EC GY PY PE SR UY VE',
  Oceania:
    'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU',
};

const MAP = new Map<string, Continent>();
for (const [continent, codes] of Object.entries(BY_CONTINENT)) {
  for (const c of codes.split(' ')) {
    MAP.set(c, continent as Continent);
  }
}

export const ALL_COUNTRIES: readonly string[] = [...MAP.keys()].sort();

export function continentOf(country: string): Continent | undefined {
  if (country === 'GLOBAL') return 'Global';
  return MAP.get(country.toUpperCase());
}

export const isKnownCountry = (c: string): boolean => c === 'GLOBAL' || MAP.has(c);

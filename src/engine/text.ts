// Deterministic text utilities: entity decoding, tokenising, similarity, keyword matching.
// Nothing here produces or rewrites publisher text; it only compares and matches.

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  euro: '\u20ac',
  pound: '\u00a3',
  copy: '\u00a9',
};

/** Decode XML/HTML entities once. Used to read publisher text exactly as the publisher wrote it. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, ' ');
}

const SCRIPT_UNITS =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

/** Comparison units: lower-cased words, or character bigrams for scripts written without spaces. */
export function units(s: string): string[] {
  const norm = s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
  if (!norm) return [];
  const out: string[] = [];
  for (const w of norm.split(/\s+/)) {
    if (SCRIPT_UNITS.test(w)) {
      const chars = [...w];
      if (chars.length === 1) out.push(chars[0]);
      for (let i = 0; i < chars.length - 1; i++) {
        out.push(chars[i] + chars[i + 1]);
      }
    } else {
      out.push(w);
    }
  }
  return out;
}

export const unitSet = (s: string): Set<string> => new Set(units(s));

/** Stable key for "same headline" comparisons within a source. */
export const titleKey = (s: string): string => units(s).join(' ');

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * How well does a page title match the stored headline? 0..1.
 * `ignore` holds publisher-name tokens that appear in page titles ("… - BBC News") but not in the headline.
 * Score = max(Dice, 0.9 × coverage of the headline) so a page title that merely adds a section or
 * publisher suffix still matches, while an unrelated story does not.
 */
export function headlineSimilarity(
  headline: string,
  pageTitle: string,
  ignore: Iterable<string> = []
): number {
  const h = unitSet(headline);
  const p = unitSet(pageTitle);
  if (h.size === 0 || p.size === 0) return 0;
  const drop = new Set(ignore);
  for (const t of drop) if (!h.has(t)) p.delete(t);
  if (p.size === 0) return 0;
  let inter = 0;
  for (const x of h) if (p.has(x)) inter++;
  const dice = (2 * inter) / (h.size + p.size);
  const coverage = inter / h.size;
  return Math.max(dice, h.size >= 4 ? 0.9 * coverage : 0);
}

// ---------- keyword matching (policy rules) ----------

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B_START = '(?<![\\p{L}\\p{N}])';
const B_END = '(?![\\p{L}\\p{N}])';

/**
 * Compile a keyword entry into a regex. Plain words match whole words, case-insensitively.
 * A trailing `*` matches any word ending ("decapitat*"). Entries starting with `re:` are raw regexes.
 */
export function compileKeyword(entry: string): RegExp {
  if (entry.startsWith('re:')) return new RegExp(entry.slice(3), 'iu');
  const wildcard = entry.endsWith('*');
  const body = escapeRe(
    (wildcard ? entry.slice(0, -1) : entry).normalize('NFKC').toLowerCase()
  ).replace(/\s+/g, '\\s+');
  return new RegExp(`${B_START}${body}${wildcard ? '[\\p{L}\\p{N}]*' : ''}${B_END}`, 'iu');
}

export const normalizeForMatch = (s: string): string => s.normalize('NFKC').toLowerCase();

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CATEGORY_TO_PILLAR } from '../apps/api/src/contract.ts';
import { DeterministicClassifierProvider } from '../apps/pipeline/src/classifier.ts';
import type { DatasetRow } from './generate-dataset.ts';

export interface ClassMetrics {
  label: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

export interface SeaBeachEvalSummary {
  total: number;
  verdict_accuracy: number;
  category_accuracy: number;
  false_allows_for_blocked: number;
  per_verdict: ClassMetrics[];
  per_category: ClassMetrics[];
}

export async function runSeaBeachEvaluation(): Promise<SeaBeachEvalSummary> {
  const dsPath = path.resolve(process.cwd(), 'tests/sea-beach-dataset.json');
  const dataset = JSON.parse(readFileSync(dsPath, 'utf8')) as { items: DatasetRow[] };
  const classifier = new DeterministicClassifierProvider();

  const verdicts = ['allow', 'block', 'unsure'] as const;
  const vStats = new Map<string, { tp: number; fp: number; fn: number }>();
  for (const v of verdicts) vStats.set(v, { tp: 0, fp: 0, fn: 0 });

  const cStats = new Map<string, { tp: number; fp: number; fn: number }>();
  let verdictMatches = 0;
  let categoryMatches = 0;
  let falseAllows = 0;

  for (let i = 0; i < dataset.items.length; i++) {
    const row = dataset.items[i];
    const pred = await classifier.classify({
      item_index: i,
      title: row.title,
      source_name: 'Audit Corpus',
      source_priority: row.source_priority,
      source_continent: row.continent,
      source_country: null,
    });

    if (pred.sea_beach_verdict === row.expected_verdict) verdictMatches++;
    if (row.expected_verdict === 'block' && pred.sea_beach_verdict === 'allow') falseAllows++;

    for (const v of verdicts) {
      const s = vStats.get(v)!;
      if (pred.sea_beach_verdict === v && row.expected_verdict === v) s.tp++;
      else if (pred.sea_beach_verdict === v && row.expected_verdict !== v) s.fp++;
      else if (pred.sea_beach_verdict !== v && row.expected_verdict === v) s.fn++;
    }

    if (row.expected_verdict === 'allow') {
      if (!cStats.has(row.category)) cStats.set(row.category, { tp: 0, fp: 0, fn: 0 });
      if (!cStats.has(pred.category)) cStats.set(pred.category, { tp: 0, fp: 0, fn: 0 });
      if (pred.category === row.category) {
        categoryMatches++;
        cStats.get(row.category)!.tp++;
      } else {
        cStats.get(pred.category)!.fp++;
        cStats.get(row.category)!.fn++;
      }
      // Ensure pillar consistency
      if (pred.pillar !== CATEGORY_TO_PILLAR[pred.category]) {
        throw new Error(`Pillar mismatch on ${row.id}`);
      }
    }
  }

  const allowTotal = dataset.items.filter((x) => x.expected_verdict === 'allow').length;
  const toMetrics = (entries: [string, { tp: number; fp: number; fn: number }][]): ClassMetrics[] =>
    entries.map(([label, s]) => ({
      label,
      tp: s.tp,
      fp: s.fp,
      fn: s.fn,
      precision: s.tp + s.fp === 0 ? 1 : Number((s.tp / (s.tp + s.fp)).toFixed(4)),
      recall: s.tp + s.fn === 0 ? 1 : Number((s.tp / (s.tp + s.fn)).toFixed(4)),
    }));

  return {
    total: dataset.items.length,
    verdict_accuracy: Number((verdictMatches / dataset.items.length).toFixed(4)),
    category_accuracy: Number((categoryMatches / Math.max(1, allowTotal)).toFixed(4)),
    false_allows_for_blocked: falseAllows,
    per_verdict: toMetrics([...vStats.entries()]),
    per_category: toMetrics([...cStats.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await runSeaBeachEvaluation();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.false_allows_for_blocked > 0) {
    console.error(`FAIL: false_allows_for_blocked=${summary.false_allows_for_blocked}`);
    process.exit(1);
  }
}

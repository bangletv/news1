import path from 'node:path';
import { ApiRepository, hostAllowed } from '../apps/api/src/repository.ts';
import { verifyDestination } from '../apps/pipeline/src/verifier.ts';

export async function runWeeklyRandomSampleAudit(sampleSize = 50, liveFetch = false) {
  const repo = new ApiRepository(path.resolve(process.cwd(), 'data/osn.sqlite'));
  const verified = repo.listAllItemsRaw('verified');
  const pool = [...verified].sort(() => Math.random() - 0.5).slice(0, sampleSize);

  const report = [];
  for (const item of pool) {
    const source = repo.getSource(item.source_id);
    const allowlisted = source ? hostAllowed(item.canonical_url, source.domain) : false;

    let liveStatus = 'skipped_offline';
    let similarity = 1;
    if (liveFetch && source) {
      const check = await verifyDestination({
        headline: item.title,
        candidateUrl: item.canonical_url,
        allowedDomain: source.domain,
        sourceName: source.name,
      });
      liveStatus = check.status;
      similarity = check.similarity;
    }

    report.push({
      id: item.id,
      source_name: item.source_name,
      title: item.title,
      canonical_url: item.canonical_url,
      allowlisted,
      liveStatus,
      similarity,
    });
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const sampleArg = args.find((a) => a.startsWith('--sample='));
  const n = sampleArg ? Number(sampleArg.split('=')[1]) : 50;
  const live = args.includes('--live');
  const results = await runWeeklyRandomSampleAudit(n, live);
  console.log(JSON.stringify({ sampled: results.length, results }, null, 2));
}

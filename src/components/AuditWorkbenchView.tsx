import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface ClassMetric {
  label: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

interface AuditPayload {
  ran_at: string;
  banned_strings: { passed: boolean; findings: unknown[] };
  ai_image_ban: { passed: boolean; findings: unknown[] };
  sea_beach_eval: {
    total: number;
    verdict_accuracy: number;
    category_accuracy: number;
    false_allows_for_blocked: number;
    per_verdict: ClassMetric[];
    per_category: ClassMetric[];
  };
  weekly_sample: {
    sampled: number;
    items: {
      id: string;
      source_name: string;
      title: string;
      allowlisted: boolean;
    }[];
  };
}

export function AuditWorkbenchView() {
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [running, setRunning] = useState(false);

  const executeAudit = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/v1/workbench/run-audit', { method: 'POST' });
      if (res.ok) {
        setAudit((await res.json()) as AuditPayload);
      }
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    void executeAudit();
  }, []);

  return (
    <div className="space-y-10">
      <div className="flex flex-col justify-between gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="font-sans text-xs font-medium tracking-widest text-stone-600 uppercase">
            Independent Verification &amp; Compliance
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-stone-900">
            Security, Link-Fidelity &amp; Policy Audit
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            Executes the repository banned-string scanner, AI-image ban check, 552-headline Sea
            Beach dataset evaluation, and random-sample outbound link verification.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void executeAudit()}
          disabled={running}
          className="min-h-[42px] shrink-0 cursor-pointer rounded-md bg-stone-900 px-5 text-sm font-medium text-stone-50 hover:bg-stone-800 disabled:opacity-60"
        >
          {running ? 'Running audit…' : 'Re-run Audit Suite'}
        </button>
      </div>

      {audit && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <p className="text-xs font-medium text-stone-600">Banned-String Lint</p>
              <div className="mt-2 flex items-center gap-2">
                {audit.banned_strings.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-[#14532D]" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-[#9A3412]" />
                )}
                <span className="font-serif text-2xl font-semibold text-stone-900">
                  {audit.banned_strings.passed ? 'Pass' : 'Fail'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <p className="text-xs font-medium text-stone-600">AI-Image Ban Check</p>
              <div className="mt-2 flex items-center gap-2">
                {audit.ai_image_ban.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-[#14532D]" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-[#9A3412]" />
                )}
                <span className="font-serif text-2xl font-semibold text-stone-900">
                  {audit.ai_image_ban.passed ? 'Pass' : 'Fail'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <p className="text-xs font-medium text-stone-600">Sea Beach Corpus</p>
              <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-stone-900">
                {(audit.sea_beach_eval.verdict_accuracy * 100).toFixed(1)}% ({audit.sea_beach_eval.total})
              </p>
            </div>

            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <p className="text-xs font-medium text-stone-600">False Allows (Blocked)</p>
              <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-stone-900">
                {audit.sea_beach_eval.false_allows_for_blocked}
              </p>
            </div>
          </div>

          {/* Per-Verdict Precision / Recall Table */}
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-[#F7F4EE] text-xs font-medium text-stone-600 uppercase">
                  <th className="px-5 py-3">Verdict Class</th>
                  <th className="px-5 py-3 text-right">TP</th>
                  <th className="px-5 py-3 text-right">FP</th>
                  <th className="px-5 py-3 text-right">FN</th>
                  <th className="px-5 py-3 text-right">Precision</th>
                  <th className="px-5 py-3 text-right">Recall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono text-xs tabular-nums">
                {audit.sea_beach_eval.per_verdict.map((row) => (
                  <tr key={row.label}>
                    <td className="px-5 py-3 font-medium text-stone-900">{row.label}</td>
                    <td className="px-5 py-3 text-right">{row.tp}</td>
                    <td className="px-5 py-3 text-right">{row.fp}</td>
                    <td className="px-5 py-3 text-right">{row.fn}</td>
                    <td className="px-5 py-3 text-right">{row.precision.toFixed(3)}</td>
                    <td className="px-5 py-3 text-right">{row.recall.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Weekly Random Sample Audit */}
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 className="font-serif text-lg font-semibold text-stone-900">
                Random-Sample Link Allowlist Check ({audit.weekly_sample.sampled} items)
              </h2>
            </div>
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-[#F7F4EE] text-xs font-medium text-stone-600 uppercase">
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Headline</th>
                  <th className="px-5 py-3 text-right">Allowlist</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {audit.weekly_sample.items.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 font-medium text-stone-900">{row.source_name}</td>
                    <td className="max-w-lg truncate px-5 py-3 text-stone-700">{row.title}</td>
                    <td className="px-5 py-3 text-right font-mono text-[#14532D]">
                      {row.allowlisted ? 'PASS' : 'FAIL'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

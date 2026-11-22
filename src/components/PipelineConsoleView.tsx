import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, AlertCircle, ShieldAlert, ExternalLink } from 'lucide-react';
import type { KillSwitchState, PublicItem, PublicSource } from '../../apps/api/src/contract.ts';

interface ClassifyResult {
  source_name: string;
  classification: {
    pillar: string;
    category: string;
    continent: string;
    country: string | null;
    sea_beach_verdict: 'allow' | 'block' | 'unsure';
    provider: string;
    held_reason?: string;
  };
  verification: {
    status: 'verified' | 'held' | 'rejected';
    reason: string;
    final_url: string;
    similarity: number;
    redirects: number;
  } | null;
}

const TEST_HEADLINES = [
  {
    label: 'Peace agreement (allow)',
    source_id: 'un-news',
    title: 'UN agencies welcome cross-border humanitarian relief corridor delivering medical aid',
    url: '',
  },
  {
    label: 'Scholarship fee scam (hold)',
    source_id: 'oxford-research',
    title: 'Global scholarship agency offers 100% guaranteed admission with processing fee required',
    url: '',
  },
  {
    label: 'Conflict casualty (block)',
    source_id: 'un-news',
    title: 'Airstrike and shelling leave dozens of casualties near border town',
    url: '',
  },
  {
    label: 'SSRF loopback check (reject)',
    source_id: 'nasa-science',
    title: 'NASA James Webb telescope observes exoplanet',
    url: 'http://127.0.0.1:8080/internal',
  },
];

export function PipelineConsoleView() {
  const [items, setItems] = useState<PublicItem[]>([]);
  const [sources, setSources] = useState<PublicSource[]>([]);
  const [killSwitches, setKillSwitches] = useState<KillSwitchState | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  const [sourceId, setSourceId] = useState('un-news');
  const [headline, setHeadline] = useState(TEST_HEADLINES[0].title);
  const [candidateUrl, setCandidateUrl] = useState('');
  const [verifyLive, setVerifyLive] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  const loadPipelineState = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/workbench/pipeline');
      const data = await res.json();
      setItems(data.items ?? []);
      setSources(data.sources ?? []);
      setKillSwitches(data.kill_switches ?? null);
      setGeminiConfigured(Boolean(data.gemini_configured));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPipelineState();
  }, []);

  const runClassifier = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setClassifying(true);
    setClassifyError(null);
    try {
      const res = await fetch('/api/v1/workbench/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: sourceId,
          title: headline,
          candidate_url: candidateUrl,
          verify_live: verifyLive || candidateUrl.trim().length > 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClassifyError(data.error?.message ?? 'Classification failed.');
      } else {
        setClassifyResult(data);
      }
    } catch {
      setClassifyError('Failed to contact pipeline classifier.');
    } finally {
      setClassifying(false);
    }
  };

  const toggleKillSwitch = async (scope: string, nextValue: boolean) => {
    const res = await fetch('/api/v1/workbench/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, enabled: nextValue }),
    });
    if (res.ok) {
      const data = await res.json();
      setKillSwitches(data.kill_switches);
    }
  };

  const verifiedCount = items.filter((i) => i.verification_status === 'verified').length;
  const heldCount = items.filter((i) => i.verification_status === 'held').length;
  const rejectedCount = items.filter((i) => i.verification_status === 'rejected').length;

  return (
    <div className="space-y-12">
      <section className="border-b border-stone-200 pb-6">
        <p className="font-sans text-xs font-medium tracking-widest text-stone-600 uppercase">
          Harvester, Classifier &amp; Link Verification
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-stone-900">
          Pipeline &amp; Verification Console
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
          Tests Sea Beach content safety, strict JSON-enum classification (Gemini 4 Hydrogen with
          deterministic policy fallback), SSRF-safe destination checks, KV kill switches, and XML
          sitemaps.
        </p>
      </section>

      {/* Operational KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-xs font-medium text-stone-600">Active Sources</p>
          <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-stone-900">
            {sources.filter((s) => s.status === 'active').length}
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-xs font-medium text-stone-600">Verified Items</p>
          <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-stone-900">
            {verifiedCount}
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-xs font-medium text-stone-600">Held for Recheck</p>
          <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-stone-900">
            {heldCount}
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-xs font-medium text-stone-600">Rejected Items</p>
          <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-stone-900">
            {rejectedCount}
          </p>
        </div>
      </div>

      {/* Interactive Classifier & Verifier */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        <form
          onSubmit={(e) => void runClassifier(e)}
          className="space-y-4 rounded-lg border border-stone-200 bg-white p-6 lg:col-span-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-semibold text-stone-900">
              Sea Beach &amp; Link-Fidelity Tester
            </h2>
            <span className="font-mono text-xs text-stone-600">
              {geminiConfigured ? 'Gemini + Fallback' : 'Deterministic Fallback'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {TEST_HEADLINES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => {
                  setSourceId(sample.source_id);
                  setHeadline(sample.title);
                  setCandidateUrl(sample.url);
                  setVerifyLive(Boolean(sample.url));
                }}
                className="cursor-pointer rounded border border-stone-200 bg-[#FBF9F5] px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-stone-900"
              >
                {sample.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="pipe-source" className="block text-xs font-medium text-stone-600">
              Registered Source
            </label>
            <select
              id="pipe-source"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-md border border-stone-300 bg-[#FBF9F5] px-3 text-sm text-stone-900"
            >
              {sources.map((s) => (
                <option key={s.source_id} value={s.source_id}>
                  {s.name} ({s.domain})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pipe-headline" className="block text-xs font-medium text-stone-600">
              Headline (Unaltered)
            </label>
            <textarea
              id="pipe-headline"
              rows={3}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 bg-[#FBF9F5] px-3 py-2 text-sm text-stone-900"
            />
          </div>

          <div>
            <label htmlFor="pipe-url" className="block text-xs font-medium text-stone-600">
              Optional Destination URL (for SSRF &amp; Live Match Check)
            </label>
            <input
              id="pipe-url"
              type="text"
              value={candidateUrl}
              onChange={(e) => setCandidateUrl(e.target.value)}
              placeholder="https://www.nasa.gov/..."
              className="mt-1 min-h-[42px] w-full rounded-md border border-stone-300 bg-[#FBF9F5] px-3 font-mono text-xs text-stone-900"
            />
          </div>

          <button
            type="submit"
            disabled={classifying}
            className="min-h-[42px] cursor-pointer rounded-md bg-stone-900 px-5 text-sm font-medium text-stone-50 hover:bg-stone-800 disabled:opacity-60"
          >
            {classifying ? 'Running checks…' : 'Classify & Verify'}
          </button>

          {classifyError && (
            <p className="text-xs font-medium text-[#9A3412]" role="alert">
              {classifyError}
            </p>
          )}
        </form>

        <div className="rounded-lg border border-stone-200 bg-white p-6 lg:col-span-6">
          {!classifyResult ? (
            <div className="py-12 text-center">
              <p className="font-serif text-lg text-stone-900">Ready for classification</p>
              <p className="mt-1 text-xs text-stone-600">
                Select a preset or enter a headline. Models receive zero URLs and output strictly
                contract enum values.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                {classifyResult.classification.sea_beach_verdict === 'allow' ? (
                  <CheckCircle2 className="h-5 w-5 text-[#14532D]" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-[#9A3412]" />
                )}
                <span className="font-serif text-xl font-semibold text-stone-900">
                  Verdict: {classifyResult.classification.sea_beach_verdict}
                </span>
              </div>

              <dl className="divide-y divide-stone-100 text-sm">
                <div className="flex justify-between py-2.5">
                  <dt className="text-xs text-stone-600">Provider</dt>
                  <dd className="font-mono text-xs text-stone-900">
                    {classifyResult.classification.provider}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-xs text-stone-600">Pillar &amp; Category</dt>
                  <dd className="font-mono text-xs text-stone-900">
                    {classifyResult.classification.pillar} / {classifyResult.classification.category}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-xs text-stone-600">Region</dt>
                  <dd className="font-mono text-xs text-stone-900">
                    {classifyResult.classification.continent}
                    {classifyResult.classification.country
                      ? ` · ${classifyResult.classification.country}`
                      : ''}
                  </dd>
                </div>
                {classifyResult.classification.held_reason && (
                  <div className="flex justify-between py-2.5">
                    <dt className="text-xs text-stone-600">Policy Reason</dt>
                    <dd className="font-mono text-xs text-[#9A3412]">
                      {classifyResult.classification.held_reason}
                    </dd>
                  </div>
                )}
                {classifyResult.verification && (
                  <>
                    <div className="flex justify-between py-2.5">
                      <dt className="text-xs text-stone-600">Destination Check</dt>
                      <dd className="font-mono text-xs font-semibold text-[#9A3412]">
                        {classifyResult.verification.status} ({classifyResult.verification.reason})
                      </dd>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <dt className="text-xs text-stone-600">Similarity / Redirects</dt>
                      <dd className="font-mono text-xs tabular-nums text-stone-900">
                        {classifyResult.verification.similarity} ·{' '}
                        {classifyResult.verification.redirects} hops
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Kill Switches & SEO Endpoints */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="rounded-lg border border-stone-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#9A3412]" />
              <h2 className="font-serif text-xl font-semibold text-stone-900">
                Operational Kill Switches (KV)
              </h2>
            </div>
            {killSwitches && (
              <button
                type="button"
                onClick={() => void toggleKillSwitch('global', !killSwitches.global)}
                className={`min-h-[38px] cursor-pointer rounded-md px-3.5 text-xs font-medium transition-colors ${
                  killSwitches.global
                    ? 'bg-[#9A3412] text-white'
                    : 'border border-stone-300 bg-white text-stone-800 hover:border-stone-900'
                }`}
              >
                {killSwitches.global ? 'Clear Global Kill Switch' : 'Activate Global Kill Switch'}
              </button>
            )}
          </div>

          <div className="mt-4 divide-y divide-stone-100">
            {sources.slice(0, 6).map((src) => {
              const paused = Boolean(killSwitches?.sources[src.source_id]);
              return (
                <div key={src.source_id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-stone-900">{src.name}</p>
                    <p className="font-mono text-xs text-stone-600">{src.domain}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleKillSwitch(`source:${src.source_id}`, !paused)}
                    className={`min-h-[36px] cursor-pointer rounded px-3 text-xs font-medium ${
                      paused
                        ? 'bg-[#9A3412] text-white'
                        : 'border border-stone-300 bg-white text-stone-700 hover:border-stone-900'
                    }`}
                  >
                    {paused ? 'Source Paused' : 'Pause Source'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-6 lg:col-span-5">
          <h2 className="font-serif text-xl font-semibold text-stone-900">
            Discoverability &amp; Sitemaps
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-stone-600">
            Dynamic XML sitemaps list verified items only. Google discovery uses sitemaps and
            internal hub links; IndexNow handles Bing and Yandex batches.
          </p>
          <div className="mt-5 space-y-2.5 text-sm">
            <a
              href="/api/v1/sitemap-index.xml"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-md border border-stone-200 px-4 py-3 font-mono text-xs text-stone-800 hover:border-stone-900"
            >
              <span>/api/v1/sitemap-index.xml</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              href="/robots.txt"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-md border border-stone-200 px-4 py-3 font-mono text-xs text-stone-800 hover:border-stone-900"
            >
              <span>/robots.txt</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              href="/api/v1/stats"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-md border border-stone-200 px-4 py-3 font-mono text-xs text-stone-800 hover:border-stone-900"
            >
              <span>/api/v1/stats</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Item Verification Status Ledger */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-[#F7F4EE] text-xs font-medium text-stone-600 uppercase">
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Headline</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Next Recheck</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.slice(0, 10).map((it) => (
                <tr key={it.id} className="hover:bg-stone-50/70">
                  <td className="px-5 py-3.5 text-xs font-medium text-stone-900">
                    {it.source_name}
                  </td>
                  <td className="max-w-md truncate px-5 py-3.5 text-xs text-stone-700">
                    {it.title}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-stone-900">
                    {it.verification_status}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs tabular-nums text-stone-600">
                    {it.recheck_at ? new Date(it.recheck_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

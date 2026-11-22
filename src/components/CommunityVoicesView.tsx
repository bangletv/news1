import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, FileText, ShieldAlert } from 'lucide-react';

type WorkflowStage =
  | 'draft'
  | 'submitted'
  | 'screening'
  | 'awaiting_decision'
  | 'approved'
  | 'rejected';

interface CommunitySubmission {
  id: string;
  name: string;
  domain: string;
  feed_url: string;
  country: string | null;
  stage: WorkflowStage;
  submitted_at: string;
}

const STAGES: { id: WorkflowStage; label: string; dotClass: string; description: string }[] = [
  {
    id: 'draft',
    label: 'Draft',
    dotClass: 'bg-[#697787]',
    description: 'Prepared locally before submitting to the registry queue.',
  },
  {
    id: 'submitted',
    label: 'Submitted',
    dotClass: 'bg-[#116351]',
    description: 'Recorded in the source-suggestion intake log.',
  },
  {
    id: 'screening',
    label: 'Screening',
    dotClass: 'bg-[#a66724]',
    description: 'Robots.txt, HTTPS canonical feed, and domain allowlist checks.',
  },
  {
    id: 'awaiting_decision',
    label: 'Awaiting editorial decision',
    dotClass: 'bg-[#a66724]',
    description: 'Human review of institutional terms and editorial scope.',
  },
  {
    id: 'approved',
    label: 'Approved',
    dotClass: 'bg-[#398057]',
    description: 'Added to sources.yaml after explicit human sign-off.',
  },
  {
    id: 'rejected',
    label: 'Rejected',
    dotClass: 'bg-[#9d4e46]',
    description: 'Declined due to aggregator status, terms, or policy criteria.',
  },
];

export function CommunityVoicesView() {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<CommunitySubmission[]>([]);

  const activeStage: WorkflowStage =
    submissions.length > 0 ? submissions[0].stage : name.trim() ? 'draft' : 'draft';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          feed_url: feedUrl,
          country: country.trim() || null,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error?.message ?? 'Unable to submit suggestion.');
      } else {
        setSubmissions((prev) => [
          {
            id: data.suggestion?.id ?? `sug_${Date.now()}`,
            name: name.trim(),
            domain: domain.trim(),
            feed_url: feedUrl.trim(),
            country: country.trim() ? country.trim().toUpperCase() : null,
            stage: 'submitted',
            submitted_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        setName('');
        setDomain('');
        setFeedUrl('');
        setCountry('');
        setNotes('');
      }
    } catch {
      setErrorMsg('Network error while recording community submission.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-8 py-2">
      <header className="border-b border-[#d7ded8] pb-7">
        <div className="osn-eyebrow">
          <span className="osn-dash" aria-hidden="true" />
          COMMUNITY DISCOVERY &amp; CONTRIBUTION PATHWAY
        </div>
        <h1 className="mt-2 font-serif text-4xl font-normal tracking-tight text-[#132e30] sm:text-5xl">
          Community Voices
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-[#506560]">
          Community submissions are strictly separated from the published institutional feed.
          Proposed feeds and public-interest publishers undergo technical screening and human
          editorial review before appearing in the directory.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: Contribution Form */}
        <div className="rounded-xl border border-[#d7ded8] bg-white p-6">
          <span className="inline-block rounded bg-[#edf2ed] px-2.5 py-1 text-[11px] font-semibold text-[#116351]">
            Separate editorial intake · Never auto-published
          </span>
          <h2 className="mt-3 font-serif text-2xl font-medium text-[#132e30]">
            Prepare an original source submission
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#506560]">
            Nominate a verified civic portal, university, community trust, or open-access journal
            with an official HTTPS RSS, Atom, or Sitemap feed.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <label className="grid gap-1.5 text-xs font-semibold text-[#132e30]">
              Organisation or community publisher name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="European Space Agency"
                className="min-h-[42px] w-full rounded-md border border-[#b8c3d0] bg-white px-3 text-sm font-normal text-[#132e30]"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-[#132e30]">
                Canonical domain
                <input
                  required
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="esa.int"
                  className="min-h-[42px] w-full rounded-md border border-[#b8c3d0] bg-white px-3 font-mono text-xs font-normal text-[#132e30]"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-semibold text-[#132e30]">
                Country (ISO-2 optional)
                <input
                  maxLength={2}
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  placeholder="GB"
                  className="min-h-[42px] w-full rounded-md border border-[#b8c3d0] bg-white px-3 font-mono text-xs font-normal text-[#132e30]"
                />
              </label>
            </div>

            <label className="grid gap-1.5 text-xs font-semibold text-[#132e30]">
              HTTPS Feed or Sitemap URL
              <input
                type="url"
                required
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://www.esa.int/rssfeed/Our_Activities/Space_Science"
                className="min-h-[42px] w-full rounded-md border border-[#b8c3d0] bg-white px-3 font-mono text-xs font-normal text-[#132e30]"
              />
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-[#132e30]">
              Editorial context &amp; licence notes
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Public science releases and open educational opportunities..."
                className="w-full rounded-md border border-[#b8c3d0] bg-white px-3 py-2 text-sm font-normal text-[#132e30]"
              />
            </label>

            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-[#9d4e46]/30 bg-[#fdf4f3] px-3 py-2.5 text-xs font-medium text-[#9d4e46]"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#116351] px-5 text-xs font-semibold text-white transition-colors hover:bg-[#0d4f40] disabled:opacity-60"
            >
              <span>{submitting ? 'Submitting…' : 'Submit to intake queue'}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        </div>

        {/* Right: Editorial Stage Tracker & Session Submissions */}
        <aside className="space-y-5">
          <div className="rounded-xl border border-[#d7ded8] bg-white p-6">
            <h2 className="font-serif text-xl font-medium text-[#132e30]">
              Contribution review stages
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#506560]">
              An authorised human administrator retains final editorial authority over every
              community submission.
            </p>
            <ul className="mt-4 space-y-3">
              {STAGES.map((stage) => {
                const isCurrent = activeStage === stage.id;
                return (
                  <li
                    key={stage.id}
                    className={`rounded-md border px-3 py-2.5 ${
                      isCurrent
                        ? 'border-[#116351] bg-[#edf2ed]/70'
                        : 'border-[#d7ded8]/60 bg-[#faf9f6]'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#132e30]">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${stage.dotClass}`}
                      />
                      <span>{stage.label}</span>
                      {isCurrent && (
                        <span className="ml-auto text-[10px] font-bold tracking-wider text-[#116351] uppercase">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1 pl-4 text-[11px] leading-snug text-[#506560]">
                      {stage.description}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          {submissions.length > 0 && (
            <div className="rounded-xl border border-[#d7ded8] bg-white p-6">
              <h3 className="font-serif text-lg font-medium text-[#132e30]">
                Recorded in this session
              </h3>
              <ul className="mt-3 space-y-3">
                {submissions.map((sub) => (
                  <li
                    key={sub.id}
                    className="rounded-md border border-[#d7ded8] bg-[#faf9f6] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold text-[#132e30]">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#116351]" />
                        {sub.name}
                      </span>
                      <span className="rounded bg-[#edf2ed] px-2 py-0.5 text-[10px] text-[#116351]">
                        Submitted
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-[#506560]">
                      {sub.feed_url}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-[#d7ded8] bg-[#112e2e] p-5 text-[#f3f5ec]">
            <div className="flex items-center gap-2 text-xs font-bold tracking-[1.4px] text-[#ddbc75] uppercase">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Editorial standard
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#dce5e1]">
              TheOpenSource.news organises original links only. Community drafts and suggestions do
              not interfere with scheduled institutional feed verification.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

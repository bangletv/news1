import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';

interface SuggestSourceModalProps {
  open: boolean;
  onClose: () => void;
}

export function SuggestSourceModal({ open, onClose }: SuggestSourceModalProps) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          feed_url: feedUrl,
          country: country || null,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error?.message ?? 'Unable to record suggestion.');
      } else {
        setStatusMessage('Thank you. Your source suggestion has been queued for terms review.');
        setName('');
        setDomain('');
        setFeedUrl('');
        setCountry('');
        setNotes('');
      }
    } catch {
      setErrorMessage('Network error while submitting suggestion.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggest-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-stone-200 bg-[#FBF9F5] p-6 shadow-lg">
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <h2 id="suggest-modal-title" className="font-serif text-2xl font-semibold text-stone-900">
              Suggest an institutional source
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              Eligible organisations include public agencies, universities, CSR programmes, and
              recognised journals.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          <div>
            <label htmlFor="sug-name" className="block text-xs font-medium text-stone-700">
              Organisation name
            </label>
            <input
              id="sug-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="European Space Agency"
              className="mt-1 min-h-[42px] w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sug-domain" className="block text-xs font-medium text-stone-700">
                Primary domain
              </label>
              <input
                id="sug-domain"
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="esa.int"
                className="mt-1 min-h-[42px] w-full rounded-md border border-stone-300 bg-white px-3 font-mono text-xs text-stone-900"
              />
            </div>
            <div>
              <label htmlFor="sug-country" className="block text-xs font-medium text-stone-700">
                Country (ISO-2 optional)
              </label>
              <input
                id="sug-country"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                placeholder="GB"
                className="mt-1 min-h-[42px] w-full rounded-md border border-stone-300 bg-white px-3 font-mono text-xs text-stone-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sug-feed" className="block text-xs font-medium text-stone-700">
              RSS, Atom, or Sitemap URL (https://)
            </label>
            <input
              id="sug-feed"
              type="url"
              required
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://www.esa.int/rssfeed/Our_Activities/Space_Science"
              className="mt-1 min-h-[42px] w-full rounded-md border border-stone-300 bg-white px-3 font-mono text-xs text-stone-900"
            />
          </div>

          <div>
            <label htmlFor="sug-notes" className="block text-xs font-medium text-stone-700">
              Licence or editorial notes
            </label>
            <textarea
              id="sug-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            />
          </div>

          {errorMessage && (
            <p className="text-xs font-medium text-[#9A3412]" role="alert">
              {errorMessage}
            </p>
          )}
          {statusMessage && (
            <p className="text-xs font-medium text-[#14532D]" role="status">
              {statusMessage}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] cursor-pointer rounded-md border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] cursor-pointer rounded-md bg-stone-900 px-5 text-sm font-medium text-stone-50 hover:bg-stone-800 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit suggestion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

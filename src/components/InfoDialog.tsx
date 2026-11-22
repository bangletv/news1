import { X } from 'lucide-react';
import { IMAGE_CREDITS_LIST } from '../lib/editorialMedia.ts';

interface InfoDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InfoDialog({ open, onClose }: InfoDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#132e30]/45 p-4"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#d7ded8] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between border-b border-[#d7ded8] pb-4">
          <div>
            <p className="text-[10px] font-bold tracking-[1.6px] text-[#116351] uppercase">
              ATTRIBUTION &amp; TRANSPARENCY
            </p>
            <h2 id="credits-dialog-title" className="mt-1 font-serif text-2xl text-[#132e30]">
              Image &amp; media credits
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#506560] hover:bg-[#edf2ed] hover:text-[#132e30]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-[#506560]">
          TheOpenSource.news strictly prohibits synthetic or AI-generated photographs,
          illustrations, and replacement thumbnails. Visual assets below are public-domain
          scientific observations or deterministic code-rendered typography.
        </p>

        <ul className="mt-4 divide-y divide-[#d7ded8] rounded-lg border border-[#d7ded8] bg-[#faf9f6]">
          {IMAGE_CREDITS_LIST.map((entry) => (
            <li key={entry.title} className="px-4 py-3">
              <p className="text-xs font-semibold text-[#132e30]">{entry.title}</p>
              <p className="mt-0.5 text-xs text-[#506560]">{entry.credit}</p>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] rounded-md bg-[#116351] px-4 text-xs font-semibold text-white hover:bg-[#0d4f40]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

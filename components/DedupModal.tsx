'use client';

// T039 — Constitution IX: typed-confirm "RESEND" to override.
// Double-voting on the same outcome can be slashable.

import { useState } from 'react';
import type { HistoryEntry } from '@/lib/history';

export interface DedupModalProps {
  entry: HistoryEntry;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DedupModal({ entry, onCancel, onConfirm }: DedupModalProps) {
  const [typed, setTyped] = useState('');
  const canProceed = typed === 'RESEND';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-lg rounded-md border border-mainnet bg-hl-surface p-5">
        <h2 className="text-lg font-semibold text-mainnet">Duplicate send detected</h2>

        <dl className="mt-3 space-y-1 text-sm">
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <dt className="text-hl-subtle">Previously sent</dt>
            <dd className="font-mono text-hl-text">{entry.sentAt}</dd>
          </div>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <dt className="text-hl-subtle">Network</dt>
            <dd className="text-hl-text">{entry.network}</dd>
          </div>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <dt className="text-hl-subtle">action fp</dt>
            <dd className="break-all font-mono text-xs text-hl-text">{entry.key}</dd>
          </div>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <dt className="text-hl-subtle">response</dt>
            <dd>
              <pre className="overflow-x-auto rounded bg-hl-bg p-2 text-[11px] text-hl-text">
                {JSON.stringify(entry.response, null, 2).slice(0, 600)}
              </pre>
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-sm text-mainnet">
          Sending the same action twice may be slashable. Only proceed if the prior send
          clearly failed and validator-publisher is still proposing the same vote.
        </p>

        <label className="mt-4 block text-sm text-hl-subtle">
          Type <code className="font-mono text-hl-text">RESEND</code> to proceed:
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="mt-1 w-full rounded bg-hl-bg p-2 font-mono text-sm text-hl-text ring-1 ring-hl-border focus:outline-none focus:ring-mainnet"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-hl-bg px-4 py-2 text-sm text-hl-text hover:bg-hl-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canProceed}
            onClick={onConfirm}
            className="rounded bg-mainnet px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Resend
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

// localStorage `hlVoteHistory` viewer. Per-browser, per-machine.
// Read-only by default; "Clear" requires typed-confirm.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { listEntries, type HistoryEntry } from '@/lib/history';
import { BUILD_TIME } from '@/lib/env';

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    setEntries(listEntries());
  }, []);

  const clearAll = () => {
    if (confirm !== 'CLEAR') return;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('hlVoteHistory');
      setEntries([]);
      setConfirm('');
    }
  };

  return (
    <main className="space-y-5">
      <header className="flex items-baseline justify-between border-b border-hl-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-hl-mint">History</h1>
          <p className="mt-1 text-sm text-hl-subtle">
            Votes submitted from this browser. localStorage, per-machine.
          </p>
        </div>
        <Link href="/" className="text-sm text-hl-subtle hover:text-hl-mint">
          ← Back
        </Link>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-hl-subtle">No history yet.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.key} className="rounded border border-hl-border bg-hl-surface p-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-hl-subtle">{e.sentAt}</span>
                <span
                  className={clsx(
                    'rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider',
                    e.network === 'mainnet'
                      ? 'bg-mainnet/20 text-mainnet'
                      : 'bg-testnet/20 text-testnet',
                  )}
                >
                  {e.network}
                </span>
              </div>
              <code className="mt-2 block break-all text-xs text-hl-text">
                {e.actionPreview}
              </code>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-hl-subtle hover:text-hl-mint">
                  response
                </summary>
                <pre className="mt-1 overflow-x-auto rounded bg-hl-bg p-2 text-[11px] text-hl-text">
                  {JSON.stringify(e.response, null, 2)}
                </pre>
              </details>
              <p className="mt-2 text-[10px] text-hl-subtle">
                fp: <code className="font-mono">{e.key}</code> &middot; nonce {e.nonce}
              </p>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <div className="rounded border border-hl-border bg-hl-surface p-3 text-sm">
          <label className="flex items-center gap-2 text-xs text-hl-subtle">
            Clear all history. Type <code className="font-mono text-hl-text">CLEAR</code>:
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              className="flex-1 rounded bg-hl-bg p-1.5 font-mono text-sm text-hl-text ring-1 ring-hl-border focus:outline-none focus:ring-mainnet"
            />
            <button
              type="button"
              onClick={clearAll}
              disabled={confirm !== 'CLEAR'}
              className="rounded bg-mainnet px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
          </label>
        </div>
      )}

      <footer className="border-t border-hl-border pt-3 text-[10px] text-hl-subtle">
        build {BUILD_TIME}
      </footer>
    </main>
  );
}

'use client';

// T037 — show the HF /exchange response. Color-coded by ok/err.

import clsx from 'clsx';

export interface ResponseViewerProps {
  state:
    | { kind: 'idle' }
    | { kind: 'pending'; phase: 'signing' | 'submitting' }
    | { kind: 'success'; response: unknown }
    | { kind: 'error'; error: string };
}

function classifyHFResponse(resp: unknown): 'ok' | 'err' | 'unknown' {
  if (resp && typeof resp === 'object') {
    const r = resp as { status?: string };
    if (r.status === 'ok') return 'ok';
    if (r.status === 'err') return 'err';
  }
  return 'unknown';
}

export function ResponseViewer({ state }: ResponseViewerProps) {
  if (state.kind === 'idle') return null;

  if (state.kind === 'pending') {
    return (
      <div className="rounded-md border border-hl-border bg-hl-surface p-4 text-sm text-hl-subtle">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-hl-mint" />
        {state.phase === 'signing' && 'Waiting for wallet signature…'}
        {state.phase === 'submitting' && 'Submitting to /exchange…'}
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-md border border-mainnet bg-mainnet/10 p-4 text-sm text-mainnet">
        <p className="font-semibold uppercase tracking-wider">Error</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs">
          {state.error}
        </pre>
      </div>
    );
  }

  const cls = classifyHFResponse(state.response);
  return (
    <div
      className={clsx(
        'rounded-md border p-4 text-sm',
        cls === 'ok' && 'border-hl-mint bg-hl-mint/10 text-hl-mint',
        cls === 'err' && 'border-mainnet bg-mainnet/10 text-mainnet',
        cls === 'unknown' && 'border-testnet bg-testnet/10 text-testnet',
      )}
    >
      <p className="font-semibold uppercase tracking-wider">
        {cls === 'ok' ? 'Accepted by /exchange' : cls === 'err' ? 'Rejected' : 'Response'}
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-hl-bg p-3 font-mono text-xs text-hl-text">
        {JSON.stringify(state.response, null, 2)}
      </pre>
    </div>
  );
}

// Tier 0 MVP scaffold. Full state machine is built up in T030~T040 (tasks.md).
// This file is intentionally minimal at T001 — it just renders the shell so
// `next build` produces a working out/ artifact for the verify gate.

export default function HomePage() {
  return (
    <main>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">hl-vote-web</h1>
        <p className="text-sm text-neutral-600">
          Hyperliquid <code className="mono">validatorL1Vote</code> signer (outcome / delisting).
          Static SPA — no backend, keys never leave your wallet or Ledger.
        </p>
      </header>

      <section className="space-y-4 rounded-md border border-dashed border-neutral-300 bg-white p-4">
        <p className="text-sm text-neutral-700">
          Skeleton in place. T030 onward will populate the paste box, preview, and wallet flow.
        </p>
        <p className="text-xs text-neutral-500">
          Build: <code className="mono">{process.env.NEXT_PUBLIC_BUILD_TIME ?? 'dev'}</code>
        </p>
      </section>
    </main>
  );
}

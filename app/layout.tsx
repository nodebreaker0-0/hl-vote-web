import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'hl-vote-web',
  description:
    'Static SPA to sign and submit Hyperliquid validatorL1Vote (outcome / delisting) actions with MetaMask or Ledger Nano. No backend.',
};

// Constitution III: connect-src reflects what THIS build is allowed to hit.
// Testnet build → only testnet endpoint in CSP. Mainnet build (NEXT_PUBLIC_MAINNET_ENABLED=true)
// → both, because the mainnet build still supports testnet target via the network selector.
const MAINNET_ENABLED = process.env.NEXT_PUBLIC_MAINNET_ENABLED === 'true';
const HF_ORIGINS = ['https://api.hyperliquid-testnet.xyz']
  .concat(MAINNET_ENABLED ? ['https://api.hyperliquid.xyz'] : [])
  .join(' ');

// 'unsafe-inline' on script-src is a forced compromise: Next.js 14 static
// export emits inline `<script>self.__next_f.push(...)</script>` blocks to
// transport hydration data, and a nonce strategy requires middleware which is
// incompatible with `output: 'export'`. Concretely:
//   - all inline scripts in out/ are build-time generated; no user input flows
//     into them, so the classic XSS attack surface this directive normally
//     defends is structurally absent.
//   - third-party origins for scripts remain blocked by 'self'.
//   - CHARTER §6 host-takeover threat is mitigated separately (operator
//     verifies device hash on Ledger; bundle SHA-256 publishable per release).
const CSP =
  "default-src 'self'; " +
  `connect-src 'self' ${HF_ORIGINS}; ` +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "frame-ancestors 'none'";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
      </head>
      <body className="min-h-screen bg-hl-bg text-hl-text antialiased font-sans">
        <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}

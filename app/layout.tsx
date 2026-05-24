import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'hl-vote-web',
  description:
    'Static SPA to sign and submit Hyperliquid validatorL1Vote (outcome / delisting) actions with MetaMask or Ledger Nano. No backend.',
};

const CSP =
  "default-src 'self'; " +
  "connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "frame-ancestors 'none'";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
      </head>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}

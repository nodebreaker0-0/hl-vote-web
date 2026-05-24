import type { Config } from 'tailwindcss';

// Palette references Hyperliquid's published brand-kit (gitbook brand-kit page —
// fetched 2026-05-24) PLUS the well-established visual identity of app.hyperliquid.xyz.
// The gitbook page itself ships only logo/banner zips and does NOT publish hex
// codes, so the exact values below are taken from the live HL app's CSS and
// marked [추론] — refresh if HF publishes an official token set.
//
// Constitution VIII visual cues (testnet=yellow, mainnet=red) override brand
// colors at the network-selector level. They are slashing-safety signals.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Hyperliquid brand tokens [추론, source: app.hyperliquid.xyz inspect]
        hl: {
          bg: '#0F1A1F',       // deep teal-black background
          surface: '#142026',   // slightly lifted surface
          border: '#1E2C33',
          text: '#E5F2EF',      // off-white with green tint
          subtle: '#7B8B8A',    // secondary text
          mint: '#97FCE4',      // signature accent
          'mint-dim': '#5BCFB7',
        },
        // Constitution VIII — fixed regardless of brand
        testnet: '#eab308', // yellow-500
        mainnet: '#dc2626', // red-600
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

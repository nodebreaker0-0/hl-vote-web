# hl-vote-web

Static SPA to sign and submit Hyperliquid `validatorL1Vote` actions (outcome, delisting, any inner shape) with MetaMask. No backend. Deterministic byte-for-byte parity with the Python SDK.

| | |
|---|---|
| Wallet | MetaMask (with optional Ledger account imported into it for mainnet) |
| Networks | testnet + mainnet (mainnet gated by build flag) |
| Backend | none — browser → `api.hyperliquid(-testnet)?.xyz/exchange` direct |
| Bundle | < 1 MB gzip |
| Audit | Python SDK ↔ TS golden 100/100 byte-exact + Constitution gate |

---

## Quick start (operator, Mac local)

Prereqs: Chromium browser (Chrome / Edge / Brave), MetaMask with your testnet v-key imported and/or a Ledger account imported into MetaMask for mainnet, Node 20+, Python 3.10+.

```bash
git clone <repo> && cd hl-vote-web
make install          # npm ci --ignore-scripts
make golden-gen       # local venv + hyperliquid-python-sdk + 100 fixtures
make verify           # 7-gate check (lint / types / tests / golden / build / gates / size)
make build            # static export → out/
npx serve out/ -l 3000
```

Open http://localhost:3000.

## Operating flow

1. **Network** — Testnet (yellow) or Mainnet (red — only on a build with `NEXT_PUBLIC_MAINNET_ENABLED=true`).
2. **Action input** — two modes:
   - **Delisting (ticker)**: type `BTC` → builds `{"type":"validatorL1Vote","D":"BTC"}` for you.
   - **Custom (JSON paste)**: paste the JSON exactly as `validator-publisher` posted it to Slack. Python-script wrappers (`action = {...}`, trailing `;`, `const x = {...};`) are accepted; the inner JSON is extracted byte-for-byte without reformatting.
3. **Validation panel** — 6-step ✅/✗/· check: input present, no credential pattern, valid JSON, top-level object, `type=validatorL1Vote`, known variant.
4. **Preview** — msgpack hex + `action_hash` + EIP-712 typed-data + `domain_hash`/`message_hash`/`signing_hash`. **These last two are what your Ledger displays — compare before approving on device.**
5. **Wallet** — Connect MetaMask. On the very first sign, MetaMask prompts to add and switch to a signer-only chain entry named **`EIP712signer`** with currency **`TMP`** (chainId 1337) — approve. The chain never sees RPC traffic; it exists only so MetaMask's chain-match check on EIP-712 typed-data passes. Subsequent signs are one popup.
6. **Sign + Submit** — typed-data sign → POST to HF → response shown verbatim.

## Pending votes panel

Below the signer, a live list of `validatorL1Votes` shows:

- Variant (**Outcome** / **Delisting**) + title.
- **Voted** (by name) / **not voted** (by name) — names resolved from HF's `validatorSummaries` so jailed/inactive sets are filtered.
- **"you ✓"** badge if your wallet's signer address is in the row's voters.
- **"Vote on this →"** button — switches the Action input to Custom mode and injects the JSON, ready to sign.

Auto-refreshes every 30 s, or click `refresh`.

## History

The **`/history`** page lists every submitted vote stored in this browser's `localStorage` (`hlVoteHistory`). Per-machine. Clear with the typed-confirm button.

---

## Build

Two distinct artifacts: testnet (default) and mainnet (gated by env). Same source — only the CSP `connect-src` allow-list and the Mainnet button's enabled state differ.

### Testnet build (default)

```bash
make verify        # all 7 gates must be green
make build         # → out/
```

### Mainnet build

Mainnet activation is intentionally a separate artifact. Before producing a mainnet build, verify CHARTER §7 gates:

1. ✅ testnet 5+ successful votes in operation
2. ✅ golden fixtures 100/100 byte-exact (`make verify-golden`)
3. ✅ Ledger device-hash hand cross-verify on at least 3 distinct actions
4. ✅ `make verify` green
5. ✅ operator explicit confirm

Then:

```bash
rm -rf out .next                           # always start clean for the alt build
NEXT_PUBLIC_MAINNET_ENABLED=true make verify
NEXT_PUBLIC_MAINNET_ENABLED=true npm run build
```

The `out/` directory now contains the mainnet build (its CSP `connect-src` allows the mainnet endpoint; the Mainnet network button is enabled). Verify locally first:

```bash
npx serve out/ -l 3000
```

To keep both builds side-by-side, copy `out/` to a distinct directory before the next build, e.g. `mv out out-mainnet` before going back to a testnet build.

### Both builds in one command (CI / Release)

The tag-triggered Release workflow (`.github/workflows/release.yml`) produces both `hl-vote-web-<version>-testnet.zip` and `hl-vote-web-<version>-mainnet.zip` automatically with SHA-256 in the Release notes. Tag a version and push:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Deploy

Once you have an `out/` directory, you can host it from anywhere. The fastest path for a validator is S3.

### S3 — one-shot deploy

```bash
BUCKET=my-validator-vote          # change me; must be globally unique
REGION=us-east-1

# 0. (one time) create bucket + relax block-public-access for static hosting
aws s3 mb s3://${BUCKET} --region ${REGION}
aws s3api put-public-access-block --bucket ${BUCKET} --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# 1. Upload the build you want (testnet `out/` or mainnet `out/`)
aws s3 sync out/ s3://${BUCKET}/ \
  --acl public-read \
  --cache-control "no-cache, no-store, must-revalidate" \
  --delete

# 2. Enable website hosting
aws s3 website s3://${BUCKET}/ \
  --index-document index.html \
  --error-document 404.html

# 3. Open
echo "http://${BUCKET}.s3-website-${REGION}.amazonaws.com/"
```

To host **both** testnet and mainnet, use two separate buckets (e.g. `vote-testnet.bharvest.io`, `vote-mainnet.bharvest.io`) — never the same bucket, since mainnet/testnet artifacts have different CSPs and feature flags.

HF endpoints have `Access-Control-Allow-Origin: *`, so the SPA works from any origin out of the box. For HTTPS / custom domain, put CloudFront in front of the bucket — standard AWS static-site pattern, no changes to the SPA.

### Other hosts (same `out/` bytes)

- **GitHub Pages** — Settings → Pages → point to `out/`.
- **IPFS** — `ipfs add -r out/`, pin the CID, share the gateway URL.
- **Vercel / Netlify** — drag-and-drop `out/`, no config.
- **Local `file://`** — open `out/index.html` directly. Most isolated.
- **`npx serve out/`** — dev sanity (the quick-start above).

### Artifact integrity check

Every GitHub Release attaches `hl-vote-web-<version>-{testnet,mainnet}.zip` with each SHA-256 in the Release notes. Before deploying anything you didn't build locally:

```bash
shasum -a 256 hl-vote-web-*.zip
```

The value must match the SHA-256 listed in the Release notes byte-for-byte. **If it does not match, do not deploy** — the artifact has been tampered with. Report it.

---

## Verify gate

`make verify` runs seven gates. All must be green to commit / push:

1. `lint` — eslint + prettier
2. `typecheck` — `tsc --noEmit` strict
3. `test` — vitest (114+ tests, including 100 golden fixtures)
4. `verify-golden` — Python SDK ↔ TS byte-exact (msgpack + 4 hashes per fixture)
5. `build` — `next build` static export → `out/`
6. `constitution-gate` — grep checks for the 10 principles in `.specify/memory/constitution.md`
7. `bundle-size` — gzipped `out/` < 1 MB

CI runs the same gates on every push + PR (`.github/workflows/ci.yml`). Tag push (`v*`) triggers `.github/workflows/release.yml` which builds both testnet + mainnet artifacts and posts SHA-256.

## Files

- `CHARTER.md` — why, threat model, Tier gating, mainnet gate
- `delegation_matrix.md` — agent vs operator authority split
- `.specify/memory/constitution.md` — 10 principles (v1.1.0)
- `specs/001-hl-vote-web/` — spec, plan, contracts, quickstart, tasks

---

## Troubleshooting

### MetaMask says `Provided chainId "1337" must match the active chainId "<N>"`

HL signing hardcodes `chainId 1337`. The app auto-adds + switches MetaMask to this chain on first sign. If the auto-add prompt fails (rare — MetaMask sometimes rejects the placeholder RPC URL), add it manually:

- MetaMask → Settings → Networks → Add network manually
- Network name: `EIP712signer`
- New RPC URL: any (e.g., `https://api.hyperliquid-testnet.xyz`)
- Chain ID: `1337`
- Currency symbol: `TMP`
- Save (ignore the "RPC chain ID does not match" warning — this chain never receives RPC traffic, it is signer-only).

Then click Sign + Submit again.

### `make golden-gen` fails with `bad interpreter`

The local venv was created with a Python version that's no longer at the same path. Reset:

```bash
rm -rf .venv
make golden-gen
```

### Ledger device shows `Blind signing must be enabled`

Open the Ethereum app on the device → Settings → Blind signing → Enabled. Reopen the app, retry.

### First MetaMask sign asks for two things in a row

Normal: (1) add + switch to phantom 1337, (2) sign the typed-data. Subsequent signs are one popup.

### Pending votes panel is empty

Either there really are no pending votes, or the `/info` endpoint returned an error — check the small error line under the refresh button. The panel auto-refreshes every 30s.

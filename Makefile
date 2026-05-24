.PHONY: install lint typecheck test golden-gen verify-golden build bundle-size constitution-gate verify clean

# ----- install -----
install:
	npm ci --ignore-scripts || npm install --ignore-scripts

# ----- lint / typecheck / test -----
lint:
	npm run lint

typecheck:
	npm run typecheck

test:
	npm run test -- --run

# ----- golden fixture (Python SDK reference) -----
#
# Uses a self-contained venv at .venv/ so we never depend on the sibling SDK's
# venv state. The gen script still imports the SDK from ../hyperliquid-python-sdk
# via sys.path injection — venv only provides msgpack / eth-account / eth-utils.
PYTHON ?= python3
VENV := .venv

$(VENV)/bin/python:
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --quiet --upgrade pip
	$(VENV)/bin/pip install --quiet msgpack eth-account eth-utils

golden-gen: $(VENV)/bin/python
	@if [ ! -d ../hyperliquid-python-sdk ]; then \
		echo "ERROR: sibling ../hyperliquid-python-sdk not found"; exit 1; \
	fi
	$(VENV)/bin/python scripts/gen_golden_fixtures.py

verify-golden:
	@if [ ! -f tests/golden/fixtures.json ]; then \
		echo "tests/golden/fixtures.json missing — run 'make golden-gen' first"; exit 1; \
	fi
	npm run test -- --run tests/golden/golden.test.ts

# ----- build -----
build:
	npm run build

# ----- bundle size (gzip < 1MB) -----
bundle-size:
	@if [ ! -d out ]; then \
		echo "out/ not present — run 'make build' first"; exit 1; \
	fi
	@total=$$(find out -name '*.js' -o -name '*.css' | xargs gzip -c | wc -c); \
		mb=$$(echo $$total | awk '{printf "%.3f", $$1/1048576}'); \
		echo "gzip bundle: $$mb MB (target < 1 MB)"; \
		test $$total -lt 1048576 || (echo "  BUNDLE TOO LARGE"; exit 1)

# ----- constitution gate -----
# Greps that enforce Constitution principles. Cheap and catches drift.
constitution-gate:
	@echo "== I.   static-only: no SSR / route handlers / server actions =="
	@! find app/ -name 'route.ts' 2>/dev/null | grep -q . || (echo "  found route.ts (NOT allowed)"; exit 1)
	@! grep -rnE "getServerSideProps|getStaticProps\\(.*revalidate" app/ pages/ 2>/dev/null || (echo "  found SSR helper"; exit 1)
	@! grep -nE "output:\\s*['\"](standalone|server)" next.config.mjs 2>/dev/null || (echo "  next.config has non-export output"; exit 1)
	@grep -nE "output:\\s*['\"]export['\"]" next.config.mjs >/dev/null || (echo "  next.config missing output: 'export'"; exit 1)
	@echo "  ok"
	@echo "== II.  action pass-through: no key sort / stringify of action =="
	@# submit.ts JSON.stringify is the HTTP wire format (not the action serialization).
	@# msgpack serialization lives in serialize.ts. Anywhere else in lib/signing/
	@# stringifying / sorting violates Constitution II.
	@! grep -rnE "Object\\.keys\\([^)]*\\)\\.sort\\(\\)" lib/signing/ 2>/dev/null || (echo "  found .sort() in lib/signing"; exit 1)
	@! grep -lnE "JSON\\.stringify" lib/signing/ 2>/dev/null | grep -vE "(submit\\.ts|index\\.ts)" > /tmp/_il2_bad || true
	@if [ -s /tmp/_il2_bad ]; then echo "  JSON.stringify in unexpected lib/signing file(s):"; cat /tmp/_il2_bad; exit 1; fi
	@echo "  ok"
	@echo "== III. mainnet build flag respected =="
	@if [ "$$NEXT_PUBLIC_MAINNET_ENABLED" = "true" ]; then \
		echo "  mainnet build — skipping URL grep"; \
	elif [ ! -d out ]; then \
		echo "  (skipped — out/ not built)"; \
	else \
		hits=$$(grep -rE "api\\.hyperliquid\\.xyz" out/ 2>/dev/null | grep -vE "api\\.hyperliquid-testnet\\.xyz" | wc -l | tr -d ' '); \
		if [ "$$hits" != "0" ]; then \
			echo "  testnet build contains mainnet URL ($$hits hit(s)):"; \
			grep -rE "api\\.hyperliquid\\.xyz" out/ 2>/dev/null | grep -vE "api\\.hyperliquid-testnet\\.xyz" | head -3; \
			exit 1; \
		fi; \
		echo "  ok (testnet build — no mainnet URL in out/)"; \
	fi
	@echo "== IV.  no 32B hex private key literal =="
	@# Synthetic hex digests in *.test.ts / tests/ / fixtures are allowed (action_hash, etc).
	@# Real private keys would never be added knowingly; this catches accidental paste.
	@! grep -rnE "['\"]?0x[a-fA-F0-9]{64}['\"]?" \
		--include='*.ts' --include='*.tsx' --include='*.md' --include='*.mjs' \
		--exclude='*.test.ts' --exclude='*.test.tsx' \
		--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=out --exclude-dir=out-mainnet --exclude-dir=tests . 2>/dev/null \
		|| (echo "  potential hex private key in source"; exit 1)
	@echo "  ok"
	@echo "== V.   dependency count <= 15 =="
	@deps=$$(node -e "console.log(Object.keys(require('./package.json').dependencies||{}).length)"); \
		echo "  direct deps: $$deps"; \
		test $$deps -le 15 || (echo "  TOO MANY direct deps"; exit 1)
	@echo "== VI.  golden fixtures dir present =="
	@test -d tests/golden && echo "  ok" || (echo "  tests/golden missing"; exit 1)
	@echo "== VII. DeviceHashConfirmModal referenced when Ledger code present =="
	@# Trigger only when lib/ledger/ contains real .ts files (not just placeholder dir).
	@if [ -d lib/ledger ] && [ -n "$$(find lib/ledger -maxdepth 1 -name '*.ts' 2>/dev/null)" ]; then \
		grep -rnE "DeviceHashConfirmModal" components/ app/ >/dev/null 2>&1 \
			|| (echo "  ledger code present but DeviceHashConfirmModal not referenced"; exit 1); \
	else \
		echo "  (skipped — no ledger code yet, Tier 1)"; \
	fi
	@echo "  ok"
	@echo "== VIII. NetworkSelector has no default value =="
	@if [ -f components/NetworkSelector.tsx ]; then \
		! grep -nE "defaultValue|defaultChecked" components/NetworkSelector.tsx 2>/dev/null \
			|| (echo "  NetworkSelector has default — violates VIII"; exit 1); \
	else \
		echo "  (skipped — component not yet present, T031)"; \
	fi
	@echo "  ok"
	@echo "== IX.  dedup cache (hlVoteHistory) referenced =="
	@grep -rnE "hlVoteHistory" lib/ components/ app/ 2>/dev/null | grep -q . || echo "  (not yet implemented — pre-T038 acceptable)"
	@echo "== gate OK =="

# ----- aggregate -----
verify: lint typecheck test verify-golden build constitution-gate bundle-size

clean:
	rm -rf node_modules .next out out-mainnet coverage tests/golden/fixtures.json

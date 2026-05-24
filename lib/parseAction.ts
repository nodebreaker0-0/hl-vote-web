// Pure JSON-action parser + slashing-safety guards.
// Used by ActionPasteBox (UI) and could be reused by Tier 1+ flows.
//
// - private-key pattern detection (Constitution IV)
// - top-level type validation
// - inner variant classification (outcome / delisting / unknown)

import type { ValidatorL1VoteAction } from './signing';

export const PRIVATE_KEY_RE = /(^|[\s"':])0x[0-9a-fA-F]{64}([\s"':,}]|$)/;
export const MNEMONIC_RE = /\b([a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/;

export type ActionVariant = 'outcome' | 'delisting' | 'unknown';

export interface ParseSuccess {
  ok: true;
  action: ValidatorL1VoteAction;
  variant: ActionVariant;
  innerKey: string | null; // the non-"type" key present (`O`, `D`, ...)
}
export interface ParseFailure {
  ok: false;
  error: string;
  /** True if the failure was a credential-shaped pattern. UI should clear input. */
  credentialDetected?: boolean;
}
export type ParseResult = ParseSuccess | ParseFailure;

export function parseAction(raw: string): ParseResult {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, error: 'Empty input.' };

  // 1. Refuse outright if anything that looks like a private key / mnemonic.
  if (PRIVATE_KEY_RE.test(text)) {
    return {
      ok: false,
      credentialDetected: true,
      error:
        'Input contains what looks like a private key (0x + 64 hex). Refusing to parse. Clear this field immediately.',
    };
  }
  if (MNEMONIC_RE.test(text)) {
    return {
      ok: false,
      credentialDetected: true,
      error:
        'Input contains what looks like a BIP-39 mnemonic. Refusing to parse. Clear this field immediately.',
    };
  }

  // 2. JSON parse.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Top-level must be a JSON object.' };
  }

  // 3. type check.
  const obj = parsed as Record<string, unknown>;
  if (obj['type'] !== 'validatorL1Vote') {
    return {
      ok: false,
      error: `Top-level "type" must be "validatorL1Vote" (got ${JSON.stringify(obj['type'])}).`,
    };
  }

  // 4. Variant classification by the first non-"type" key.
  const innerKey = Object.keys(obj).find((k) => k !== 'type') ?? null;
  let variant: ActionVariant;
  if (innerKey === 'O') variant = 'outcome';
  else if (innerKey === 'D') variant = 'delisting';
  else variant = 'unknown';

  return {
    ok: true,
    action: obj as ValidatorL1VoteAction,
    variant,
    innerKey,
  };
}

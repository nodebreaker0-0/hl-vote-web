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

/**
 * Strip common copy-paste wrappers so the operator can paste straight from
 * a Python script (`action = {...}`) or Slack code-block. The extracted slice
 * MUST still be the verbatim JSON sub-string — we never reformat, only locate.
 */
function extractJsonSlice(text: string): string {
  let t = text.trim();

  // Drop a leading `<ident> =` or `<ident>:` assignment.
  t = t.replace(/^(?:const|let|var)?\s*[A-Za-z_]\w*\s*[:=]\s*/, '');

  // Drop a trailing semicolon or comma.
  t = t.replace(/[;,]\s*$/, '');

  // If text doesn't start with '{', look for the first balanced `{...}` block.
  if (!t.startsWith('{')) {
    const start = t.indexOf('{');
    if (start < 0) return t; // let JSON.parse fail with a sane message
    // Walk to the matching closing brace, ignoring braces inside strings.
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < t.length; i++) {
      // String.charAt always returns string (never undefined), so we avoid the
      // `noUncheckedIndexedAccess` -> non-null-assertion dance.
      const ch = t.charAt(i);
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (ch === '\\') {
          esc = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end > 0) t = t.slice(start, end + 1);
  }

  return t;
}

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

  // 2. JSON parse. Strip common wrappers (`action = {...}`, trailing `;`, etc.)
  // first so a verbatim Python-script paste works. The extracted slice must
  // still be the original byte-for-byte JSON object — we only locate, never
  // reformat.
  const sliced = extractJsonSlice(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(sliced);
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

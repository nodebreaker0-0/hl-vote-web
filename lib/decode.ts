// Deterministic, human-readable decode of a validatorL1Vote action.
//
// NOT an LLM and NOT involved in signing — pure read used only to help the
// operator sanity-check WHAT they are about to sign. Resolves outcome ids and
// side indices against `outcomeMeta` (the biggest source of inadvertent human
// error per HL validators). Never mutates the action or affects msgpack bytes.

import type { OutcomeMeta, OutcomeInfo } from '@/lib/api';

export type DecodedVariant =
  | 'Delisting'
  | 'Outcome deploy'
  | 'Outcome deploy (question)'
  | 'Outcome settle'
  | 'Unknown';

export interface DecodeLine {
  label: string;
  value: string;
  /** Render prominently — the fields a human must verify. */
  emphasis?: boolean;
}

export interface DecodedAction {
  variant: DecodedVariant;
  title: string;
  lines: DecodeLine[];
  /** Shown as a red advisory when something can't be resolved / looks risky. */
  warning?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function findOutcome(meta: OutcomeMeta | null, id: number): OutcomeInfo | undefined {
  return meta?.outcomes.find((o) => o.outcome === id);
}

/** Format a settleFraction (continuous X in [0,1]) into yes/no settle values. */
function fmtFraction(raw: unknown): { x: number | null; text: string } {
  const x = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(x)) return { x: null, text: String(raw) };
  return { x, text: `${x}` };
}

export function decodeAction(
  action: Record<string, unknown>,
  meta: OutcomeMeta | null,
): DecodedAction {
  // Delisting — { type, D: "<ticker/market>" }
  if ('D' in action) {
    const ticker = String(action.D);
    return {
      variant: 'Delisting',
      title: ticker,
      lines: [{ label: 'Delist asset/market', value: ticker, emphasis: true }],
    };
  }

  // Outcome family — { type, O: { <innerKey>: {...} } }
  const O = asRecord(action.O);
  if (O) {
    const innerKey = Object.keys(O)[0] ?? '';
    const v = asRecord(O[innerKey]) ?? {};

    // Settle — { settleOutcome: { outcome, settleFraction, details } }
    if (innerKey === 'settleOutcome') {
      const id = Number(v.outcome);
      const info = findOutcome(meta, id);
      const yesName = info?.sideSpecs?.[0]?.name ?? 'yes';
      const noName = info?.sideSpecs?.[1]?.name ?? 'no';
      const { x, text } = fmtFraction(v.settleFraction);
      const fractionLine =
        x === null
          ? text
          : `${text} → ${yesName} (yes / side 0) = ${x}, ${noName} (no / side 1) = ${+(1 - x).toFixed(6)}`;
      const lines: DecodeLine[] = [
        { label: 'Action', value: 'Settle outcome' },
        {
          label: 'Outcome',
          value: info ? `#${id} — ${info.name}` : `#${id} — NOT FOUND in outcomeMeta`,
          emphasis: true,
        },
        { label: 'settleFraction', value: fractionLine, emphasis: true },
        { label: 'Sides', value: `[0] yes = ${yesName} · [1] no = ${noName}` },
        { label: 'Details', value: String(v.details ?? ''), emphasis: true },
      ];
      return {
        variant: 'Outcome settle',
        title: info ? info.name : `settle #${id}`,
        lines,
        warning: info
          ? undefined
          : `Outcome #${id} is not in outcomeMeta — confirm the id and side mapping manually before signing.`,
      };
    }

    // Deploy (binary) — { registerTokensAndStandaloneOutcome: { nameAndDescription:[name,desc], sideNames, quoteToken } }
    if (innerKey === 'registerTokensAndStandaloneOutcome') {
      const nad = Array.isArray(v.nameAndDescription) ? (v.nameAndDescription as unknown[]) : [];
      const name = typeof nad[0] === 'string' ? nad[0] : '(unnamed)';
      const desc = typeof nad[1] === 'string' ? nad[1] : '';
      const sides = Array.isArray(v.sideNames) ? (v.sideNames as unknown[]).map(String) : [];
      return {
        variant: 'Outcome deploy',
        title: name,
        lines: [
          { label: 'Action', value: 'Deploy outcome (binary)' },
          { label: 'Name', value: name, emphasis: true },
          { label: 'Description', value: desc, emphasis: true },
          {
            label: 'Sides',
            value: sides.length ? `[0] yes = ${sides[0]} · [1] no = ${sides[1] ?? '?'}` : '(none)',
          },
          { label: 'quoteToken', value: String(v.quoteToken ?? '') },
        ],
      };
    }

    // Deploy (multi-option question) — { registerTokensAndQuestion: { nameAndDescription, namedOutcomes, fallbackOutcome } }
    if (innerKey === 'registerTokensAndQuestion') {
      const nad = Array.isArray(v.nameAndDescription) ? (v.nameAndDescription as unknown[]) : [];
      const name = typeof nad[0] === 'string' ? nad[0] : '(unnamed)';
      const desc = typeof nad[1] === 'string' ? nad[1] : '';
      const named = Array.isArray(v.namedOutcomes) ? (v.namedOutcomes as unknown[]) : [];
      return {
        variant: 'Outcome deploy (question)',
        title: name,
        lines: [
          { label: 'Action', value: 'Deploy question (multi-option)' },
          { label: 'Name', value: name, emphasis: true },
          { label: 'Description', value: desc, emphasis: true },
          { label: 'Options', value: `${named.length} named outcomes` },
          ...(v.fallbackOutcome !== undefined
            ? [{ label: 'Fallback', value: `#${String(v.fallbackOutcome)}` }]
            : []),
        ],
      };
    }

    // Unknown O variant — still signs, but flag it.
    return {
      variant: 'Unknown',
      title: innerKey || 'unknown',
      lines: [{ label: 'Inner key', value: innerKey || '(none)' }],
      warning: `Unknown outcome variant "${innerKey}" — no decode available; verify the raw JSON carefully.`,
    };
  }

  // Neither D nor O.
  const k = Object.keys(action).filter((key) => key !== 'type')[0] ?? '?';
  return {
    variant: 'Unknown',
    title: k,
    lines: [{ label: 'Inner key', value: k }],
    warning: `Unknown validatorL1Vote shape "${k}" — verify the raw JSON carefully.`,
  };
}

const UNIVERSAL_CHECK =
  'This action is exactly as published by the validator-publisher (not hand-edited).';

/**
 * Variant-aware sanity checklist the operator must confirm before signing
 * (Jeff: the action is LLM-generated — "important for human validators to check
 * things"). The first item is universal (anti-slash: don't sign self-crafted
 * actions); the rest target the per-variant error-prone fields.
 */
export function sanityChecklist(action: Record<string, unknown>): string[] {
  if ('D' in action) {
    return [UNIVERSAL_CHECK, `Delisting the correct asset/market: "${String(action.D)}".`];
  }
  const O = asRecord(action.O);
  if (O) {
    const innerKey = Object.keys(O)[0] ?? '';
    if (innerKey === 'settleOutcome') {
      return [
        UNIVERSAL_CHECK,
        'Outcome id ↔ market name above is correct (cross-checked against outcomeMeta).',
        'settleFraction settles the intended side (first side = yes, second = no).',
        'The details text matches the real-world result (LLM-generated — verify it).',
      ];
    }
    if (innerKey === 'registerTokensAndStandaloneOutcome' || innerKey === 'registerTokensAndQuestion') {
      return [UNIVERSAL_CHECK, 'The market name, description and sides/options match the proposal.'];
    }
    return [UNIVERSAL_CHECK, 'I reviewed the raw action JSON for this unknown outcome variant.'];
  }
  return [UNIVERSAL_CHECK, 'I reviewed the raw action JSON carefully.'];
}

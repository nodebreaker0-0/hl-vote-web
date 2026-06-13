import { describe, it, expect } from 'vitest';
import { decodeAction } from './decode';
import type { OutcomeMeta } from './api';

const meta: OutcomeMeta = {
  outcomes: [
    {
      outcome: 110,
      name: 'Champions League Winner',
      description: 'desc',
      sideSpecs: [{ name: 'PSG' }, { name: 'Arsenal' }],
      quoteToken: 'USDC',
    },
  ],
  questions: [],
};

describe('decodeAction', () => {
  it('settleOutcome: resolves id → name, side names, and yes/no fraction', () => {
    const d = decodeAction(
      {
        type: 'validatorL1Vote',
        O: { settleOutcome: { outcome: 110, settleFraction: '1', details: 'PSG won' } },
      },
      meta,
    );
    expect(d.variant).toBe('Outcome settle');
    expect(d.title).toBe('Champions League Winner');
    expect(d.warning).toBeUndefined();
    const byLabel = Object.fromEntries(d.lines.map((l) => [l.label, l.value]));
    expect(byLabel['Outcome']).toBe('#110 — Champions League Winner');
    // settleFraction "1" → first side (PSG / yes) = 1, second (Arsenal / no) = 0
    expect(byLabel['settleFraction']).toContain('PSG (yes / side 0) = 1');
    expect(byLabel['settleFraction']).toContain('Arsenal (no / side 1) = 0');
    expect(byLabel['Details']).toBe('PSG won');
  });

  it('settleOutcome: unknown id → warning, no crash', () => {
    const d = decodeAction(
      { type: 'validatorL1Vote', O: { settleOutcome: { outcome: 999, settleFraction: '0.5' } } },
      meta,
    );
    expect(d.warning).toMatch(/999/);
    const byLabel = Object.fromEntries(d.lines.map((l) => [l.label, l.value]));
    expect(byLabel['Outcome']).toContain('NOT FOUND');
    // falls back to generic yes/no labels
    expect(byLabel['settleFraction']).toContain('yes (yes / side 0) = 0.5');
    expect(byLabel['settleFraction']).toContain('no (no / side 1) = 0.5');
  });

  it('settleOutcome: decodes with null meta (offline) using ids only', () => {
    const d = decodeAction(
      { type: 'validatorL1Vote', O: { settleOutcome: { outcome: 110, settleFraction: '0' } } },
      null,
    );
    expect(d.variant).toBe('Outcome settle');
    expect(d.warning).toBeTruthy();
  });

  it('registerTokensAndStandaloneOutcome: deploy decode', () => {
    const d = decodeAction(
      {
        type: 'validatorL1Vote',
        O: {
          registerTokensAndStandaloneOutcome: {
            nameAndDescription: ['BTC above 100k', 'resolves yes if ...'],
            sideNames: ['Yes', 'No'],
            quoteToken: 0,
          },
        },
      },
      null,
    );
    expect(d.variant).toBe('Outcome deploy');
    expect(d.title).toBe('BTC above 100k');
  });

  it('settleOutcome (I-7): multi-outcome question → side table + piecemeal count', () => {
    const multiMeta: OutcomeMeta = {
      outcomes: [
        { outcome: 7002, name: 'Other', description: '', sideSpecs: [{ name: 'Yes' }, { name: 'No' }], quoteToken: 'USDH' },
        { outcome: 7003, name: 'Akami', description: '', sideSpecs: [{ name: 'Yes' }, { name: 'No' }], quoteToken: 'USDH' },
        { outcome: 7004, name: 'Canned Tuna', description: '', sideSpecs: [{ name: 'Yes' }, { name: 'No' }], quoteToken: 'USDH' },
        { outcome: 7005, name: 'Otoro', description: '', sideSpecs: [{ name: 'Yes' }, { name: 'No' }], quoteToken: 'USDH' },
      ],
      questions: [
        {
          question: 182,
          name: 'What will Hypurr eat the most of in May 2026?',
          description: '',
          fallbackOutcome: 7002,
          namedOutcomes: [7003, 7004, 7005],
          settledNamedOutcomes: [7004], // Canned Tuna already settled (piecemeal)
        },
      ],
    };
    const d = decodeAction(
      { type: 'validatorL1Vote', O: { settleOutcome: { outcome: 7005, settleFraction: '1' } } },
      multiMeta,
    );
    const mo = d.multiOutcome;
    expect(mo).toBeDefined();
    if (!mo) return;
    expect(mo.questionId).toBe(182);
    expect(mo.namedTotal).toBe(3);
    expect(mo.settledCount).toBe(1);
    // rows: 3 named + fallback = 4
    expect(mo.rows).toHaveLength(4);
    const target = mo.rows.find((r) => r.isTarget);
    expect(target?.outcome).toBe(7005);
    expect(target?.name).toBe('Otoro');
    expect(mo.rows.find((r) => r.outcome === 7004)?.settled).toBe(true);
    expect(mo.rows.find((r) => r.isFallback)?.outcome).toBe(7002);
  });

  it('settleOutcome: binary outcome (no question) → no multiOutcome', () => {
    const d = decodeAction(
      { type: 'validatorL1Vote', O: { settleOutcome: { outcome: 110, settleFraction: '1' } } },
      meta,
    );
    expect(d.multiOutcome).toBeUndefined();
  });

  it('registerTokensAndQuestion (I-8): question name + option list', () => {
    const d = decodeAction(
      {
        type: 'validatorL1Vote',
        O: {
          registerTokensAndQuestion: {
            quoteToken: 0,
            questionNameAndDescription: ['May CPI year-over-year', 'resolves by ...'],
            fallbackNameAndDescription: ['Fallback', ''],
            namedOutcomes: [
              ['Below 4.3%', 'resolves Yes if below 4.3%'],
              ['Exactly 4.3%', 'resolves Yes if exactly 4.3%'],
              ['Above 4.3%', 'resolves Yes if above 4.3%'],
            ],
          },
        },
      },
      null,
    );
    expect(d.variant).toBe('Outcome deploy (question)');
    expect(d.title).toBe('May CPI year-over-year'); // reads questionNameAndDescription, not (unnamed)
    expect(d.options).toHaveLength(3);
    expect(d.options?.map((o) => o.name)).toEqual(['Below 4.3%', 'Exactly 4.3%', 'Above 4.3%']);
    const byLabel = Object.fromEntries(d.lines.map((l) => [l.label, l.value]));
    expect(byLabel['Options']).toBe('3 options');
    expect(byLabel['Fallback']).toBe('Fallback');
  });

  it('settleQuestion: atomic multi-outcome settle → per-outcome rows + winner', () => {
    const m: OutcomeMeta = {
      outcomes: [
        { outcome: 101, name: 'Below 4.3%', description: '', sideSpecs: [{ name: 'Yes' }, { name: 'No' }], quoteToken: 'USDC' },
        { outcome: 102, name: 'Exactly 4.3%', description: '', sideSpecs: [{ name: 'Yes' }, { name: 'No' }], quoteToken: 'USDC' },
        { outcome: 103, name: 'Above 4.3%', description: '', sideSpecs: [{ name: 'Yes' }, { name: 'No' }], quoteToken: 'USDC' },
      ],
      questions: [
        { question: 19, name: 'May CPI YoY', description: '', namedOutcomes: [101, 102, 103], settledNamedOutcomes: [] },
      ],
    };
    const d = decodeAction(
      {
        type: 'validatorL1Vote',
        O: {
          settleQuestion: {
            question: 19,
            settleFractionsAndDetails: [
              [101, ['1', 'CPI was 4.2%, below 4.3%']],
              [102, ['0', 'not exactly 4.3%']],
              [103, ['0', 'not above 4.3%']],
            ],
          },
        },
      },
      m,
    );
    expect(d.variant).toBe('Outcome settle (question)');
    expect(d.title).toBe('May CPI YoY');
    expect(d.warning).toBeUndefined();
    const qs = d.questionSettle;
    expect(qs).toBeDefined();
    if (!qs) return;
    expect(qs.rows).toHaveLength(3);
    const win = qs.rows.filter((r) => r.winner);
    expect(win).toHaveLength(1);
    expect(win[0]?.name).toBe('Below 4.3%');
    expect(qs.rows.find((r) => r.outcome === 102)?.fraction).toBe('0');
    const byLabel = Object.fromEntries(d.lines.map((l) => [l.label, l.value]));
    expect(byLabel['Winner']).toBe('Below 4.3%');
  });

  it('settleQuestion: unknown question id → warning, no crash', () => {
    const d = decodeAction(
      { type: 'validatorL1Vote', O: { settleQuestion: { question: 999, settleFractionsAndDetails: [[1, ['1', 'x']]] } } },
      null,
    );
    expect(d.variant).toBe('Outcome settle (question)');
    expect(d.warning).toMatch(/999/);
  });

  it('delisting: D variant', () => {
    const d = decodeAction({ type: 'validatorL1Vote', D: 'BLAST' }, null);
    expect(d.variant).toBe('Delisting');
    expect(d.title).toBe('BLAST');
  });

  it('unknown O inner key → warning', () => {
    const d = decodeAction({ type: 'validatorL1Vote', O: { somethingNew: {} } }, null);
    expect(d.variant).toBe('Unknown');
    expect(d.warning).toMatch(/somethingNew/);
  });
});

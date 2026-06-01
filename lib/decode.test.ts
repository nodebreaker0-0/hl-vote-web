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

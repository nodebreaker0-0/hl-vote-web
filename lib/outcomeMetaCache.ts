// Local (backend-less) cache of outcomeMeta entries.
//
// HF removes an outcome from the live `outcomeMeta` response once settling
// begins — so a *pending settle vote* references an id that is no longer in the
// live response (verified 2026-06-01: mainnet #110, testnet #10205/#10281 all
// absent while their settle votes were pending). To still resolve id → name we
// cache every outcome we observe while it is live. localStorage persists across
// refresh and browser restart, so the cache survives sessions. Only outcomes
// this browser saw while live are resolvable; anything never cached falls back
// to "not found" in the decode (no DB; that's hl-markets' indexer job).

import type { OutcomeInfo, QuestionInfo } from '@/lib/api';

const KEY = 'hlOutcomeMetaCache';
const Q_KEY = 'hlQuestionMetaCache';

type Cache = Record<string, OutcomeInfo>;

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const probe = '__hlom_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function readKey<T>(key: string): Record<string, T> {
  const s = safeStorage();
  if (!s) return {};
  const raw = s.getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, T>;
    }
  } catch {
    // fall through
  }
  return {};
}

function read(): Cache {
  return readKey<OutcomeInfo>(KEY);
}

/** Merge live outcomes into the cache (latest wins). No-op without storage. */
export function cacheOutcomes(outcomes: OutcomeInfo[]): void {
  const s = safeStorage();
  if (!s || outcomes.length === 0) return;
  const c = read();
  for (const o of outcomes) c[String(o.outcome)] = o;
  s.setItem(KEY, JSON.stringify(c));
}

/** Every cached outcome — for merging into a decode lookup. */
export function getCachedOutcomes(): OutcomeInfo[] {
  return Object.values(read());
}

// Questions are dropped from live outcomeMeta once a question enters settlement
// — exactly when its `settleQuestion` vote is pending — so cache them too, the
// same best-effort way as outcomes (resolvable only if seen while active).

/** Merge live questions into the cache (latest wins). No-op without storage. */
export function cacheQuestions(questions: QuestionInfo[]): void {
  const s = safeStorage();
  if (!s || questions.length === 0) return;
  const c = readKey<QuestionInfo>(Q_KEY);
  for (const q of questions) c[String(q.question)] = q;
  s.setItem(Q_KEY, JSON.stringify(c));
}

/** Every cached question — for merging into a decode lookup. */
export function getCachedQuestions(): QuestionInfo[] {
  return Object.values(readKey<QuestionInfo>(Q_KEY));
}

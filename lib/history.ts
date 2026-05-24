// T038 — localStorage dedup cache. Constitution IX.
//
// Keyed by sha256(msgpack(action)) so that two semantically identical actions
// (same byte string) collide regardless of when they were sent. The cache is
// per-machine; coordinate across operators by sharing the signing host or by
// trusting validator-publisher to surface each action only once.

import { sha256 } from '@noble/hashes/sha2';
import { serialize, toHex, type Network } from '@/lib/signing';

const STORAGE_KEY = 'hlVoteHistory';

export interface HistoryEntry {
  /** sha256(msgpack(action)) — also the key in the dict */
  key: string;
  /** decimal string of the nonce used (for u64 safety) */
  nonce: string;
  network: Network;
  /** ISO timestamp */
  sentAt: string;
  /** Server response (parsed JSON). Trimmed if huge. */
  response: unknown;
  /** First ~120 chars of the action JSON for the UI */
  actionPreview: string;
}

export type HistoryDict = Record<string, HistoryEntry>;

export function actionFingerprint(action: object): string {
  const bytes = serialize(action);
  const digest = sha256(bytes);
  return toHex(digest);
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const probe = '__hlvote_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readHistory(): HistoryDict {
  const s = safeStorage();
  if (!s) return {};
  const raw = s.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as HistoryDict;
    }
  } catch {
    // fall through
  }
  return {};
}

export function getEntry(key: string): HistoryEntry | undefined {
  return readHistory()[key];
}

export function recordEntry(entry: HistoryEntry): void {
  const s = safeStorage();
  if (!s) return; // soft-fail; UI shows a banner separately
  const dict = readHistory();
  dict[entry.key] = entry;
  s.setItem(STORAGE_KEY, JSON.stringify(dict));
}

export function listEntries(): HistoryEntry[] {
  return Object.values(readHistory()).sort((a, b) =>
    a.sentAt < b.sentAt ? 1 : -1,
  );
}

/** Returns null if localStorage works, a reason string otherwise. */
export function storageStatus(): string | null {
  if (typeof window === 'undefined') return 'no window (SSR)';
  if (safeStorage() === null) return 'localStorage unavailable — dedup OFF';
  return null;
}

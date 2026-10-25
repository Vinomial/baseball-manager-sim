import { SAVE_VERSION } from './league/season';
import type { Career } from './types';

const SAVE_KEY = 'baseball-manager-sim/save';

export function saveCareer(c: Career): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(c)); } catch { /* 容量不足などは無視 */ }
}

/** 古いバージョンのセーブデータを最新の形に直す.直せないときは null. */
export function migrate(raw: unknown): Career | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown> & { version?: number };
  if (c.version === 1) {
    // v2: チーム能力の履歴と今シーズンの結果を追加
    c.hist = [];
    c.results = [];
    c.version = 2;
  }
  if (c.version === 2) {
    // v3: 投手成績に被安打と与四球を追加
    const teams = (c.teams ?? []) as { players: { stats: Record<string, number> }[] }[];
    for (const t of teams) for (const p of t.players) { p.stats.ha ??= 0; p.stats.bba ??= 0; }
    c.version = 3;
  }
  return c.version === SAVE_VERSION ? (c as unknown as Career) : null;
}

export function loadCareer(): Career | null {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? migrate(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* 無視 */ }
}

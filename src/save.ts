import { newRecords, SAVE_VERSION } from './league/season';
import { pickRival } from './league/awards';
import { fillOtherLeagues } from './league/world';
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
  if (c.version === 3) {
    migrateV3(c);
    c.version = 4;
  }
  if (c.version === 4) {
    // v5: 実績,表彰,名選手,対戦成績,ライバル,チームの記録を追加
    Object.assign(c, {
      ach: {}, news: [], awards: [], legends: [], h2h: {}, rival: null, ended: false,
      rec: newRecords(),
    });
    c.version = 5;
  }
  if (c.version === SAVE_VERSION && (c as unknown as Career).rival === null) pickRival(c as unknown as Career);
  return c.version === SAVE_VERSION ? (c as unknown as Career) : null;
}

/** v4: 全リーグの世界,選手の通算成績,自由契約,優勝の記録を追加 */
function migrateV3(c: Record<string, unknown>): void {
  const old = c as unknown as {
    level: number; week: number; phase: string; teams: Career['teams']; schedule: Career['leagues'][0]['schedule'];
    stand: Career['leagues'][0]['stand']; userId: number; off: { from: number } | null;
  };
  for (const t of old.teams) for (const p of t.players) p.seasons = [];
  // オフシーズン中のデータは,昇格・降格の結果だけを引き継いで新シーズンの手前に戻す
  const offseason = old.phase === 'off';
  if (offseason) {
    old.teams = old.teams.filter((t) => t.user);
    old.schedule = [];
    old.stand = {};
    old.week = 0;
    c.phase = 'season';
    c.off = null;
  }
  const cc = c as unknown as Career;
  cc.fa = [];
  cc.champs = [];
  const userLeague: Career['leagues'][0] = {
    level: old.level, teamIds: old.teams.map((t) => t.id), schedule: old.schedule, stand: old.stand, week: old.week,
  };
  fillOtherLeagues(cc, userLeague, offseason);
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

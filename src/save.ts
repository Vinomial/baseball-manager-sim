import { newRecords, SAVE_VERSION, snapshotYear } from './league/season';
import type { Player } from './types';
import { emptyPantry } from './growth/meals';
import { pickRival } from './league/awards';
import { emptyFac, emptyMarket } from './league/economy';
import { scheduleWeeks, SEASON_START } from './league/calendar';
import { refillMissions } from './league/missions';
import { fillOtherLeagues } from './league/world';
import { genAbilities } from './growth/abilities';
import { playerValue, salaryOf } from './growth/player';
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
  if (c.version === 5) {
    // v6: 週ごとの出来事を追加
    c.event = null;
    c.version = 6;
  }
  if (c.version === 6) {
    // v7: オフシーズンの段階を追加
    const off = c.off as { step?: number } | null;
    if (off) off.step = 3;
    c.version = 7;
  }
  if (c.version === 7) {
    // v8: 年俸,監督の信頼度,解任を追加
    for (const t of (c.teams ?? []) as { players: Player[] }[]) for (const p of t.players) p.salary = salaryOf(p);
    for (const p of (c.fa ?? []) as Player[]) p.salary = salaryOf(p);
    c.trust = 60;
    c.revenue = 1;
    c.fired = null;
    c.version = 8;
  }
  if (c.version === 8) {
    // v9: 球種,特殊能力,選手の絆を追加
    for (const t of (c.teams ?? []) as { players: Player[]; bonds?: [number, number][] }[]) {
      t.bonds = [];
      for (const p of t.players) genAbilities(p, playerValue(p) - 3);
    }
    for (const p of (c.fa ?? []) as Player[]) genAbilities(p, playerValue(p) - 3);
    c.version = 9;
  }
  if (c.version === 9) {
    // v10: ミッション,食材,料理を追加
    Object.assign(c, { missions: [], lastMenus: [], pantry: emptyPantry(), meal: null, mid: 1 });
    refillMissions(c as unknown as Career);
    c.version = 10;
  }
  if (c.version === 10) {
    // v11: 全日本選手権を追加
    Object.assign(c, { cups: [], cupBracket: [] });
    const off = c.off as { cup?: string } | null;
    if (off) off.cup = '';
    c.version = 11;
  }
  if (c.version === 11) {
    // v12: 1 年 48 週のカレンダー.各リーグの試合を暦の週に割り振る
    const cc = c as unknown as Career;
    for (const lg of cc.leagues) { lg.weeks = scheduleWeeks(lg.schedule?.length ?? 0); lg.po = null; }
    const ul = cc.leagues[cc.level];
    cc.cal = cc.phase === 'season' ? (ul.weeks[Math.min(ul.week, ul.weeks.length - 1)] ?? SEASON_START) : 0;
    cc.cup = null;
    c.version = 12;
  }
  if (c.version === 12) {
    // v13: 資金,施設,食材の相場を追加
    Object.assign(c, { funds: 3000, fac: emptyFac(), market: emptyMarket() });
    c.version = 13;
  }
  if (c.version === 13) {
    // v14: 順位の遷移を追加
    for (const lg of ((c as unknown as Career).leagues ?? [])) lg.rankHist = {};
    c.version = 14;
  }
  if (c.version === 14) {
    // v15: 難易度,おまかせ進行,1 年の振り返り用の記録を追加
    Object.assign(c, { diff: 'normal', auto: { lineup: false, rest: false } });
    snapshotYear(c as unknown as Career);
    c.version = 15;
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
    level: old.level, teamIds: old.teams.map((t) => t.id), schedule: old.schedule ?? [], stand: old.stand ?? {}, week: old.week, weeks: [], po: null, rankHist: {},
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

import { emptyStaff, newRecords, SAVE_VERSION, snapshotYear } from './league/season';
import { refreshPool } from './league/staff';
import type { Player } from './types';
import { emptyPantry } from './growth/meals';
import { pickRival } from './league/awards';
import { makeGoals } from './league/goals';
import { emptyFac, emptyMarket } from './league/economy';
import { scheduleWeeks, SEASON_START } from './league/calendar';
import { refillMissions } from './league/missions';
import { addDivisions, addMissingLeagues, fillOtherLeagues } from './league/world';
import { genAbilities } from './growth/abilities';
import { PERS_KEYS } from './growth/personality';
import { playerValue, salaryOf } from './growth/player';
import type { Career } from './types';

const SAVE_KEY = 'baseball-manager-sim/save';

/** この文字数を超えたら,古い記録を整理する(ブラウザの保存容量はおよそ 500 万文字) */
export const SIZE_PRUNE = 2_400_000;
/** これを超えたら,バックアップをすすめる */
export const SIZE_WARN = 3_500_000;

export interface SaveStatus { ok: boolean; size: number; }

/** 容量が大きくなりすぎたとき,古い記録を整理する.遊びに影響のない部分だけを削る. */
export function pruneCareer(c: Career): void {
  c.hist = c.hist.slice(-240);
  c.awards = c.awards.slice(-200);
  c.cups = c.cups.slice(-30);
  c.champs = c.champs.slice(-80);
  for (const t of c.teams) {
    if (t.user) continue;
    for (const p of t.players) if (p.seasons.length > 10) p.seasons = p.seasons.slice(-10);
  }
}

export function saveCareer(c: Career): SaveStatus {
  let json = JSON.stringify(c);
  if (json.length > SIZE_PRUNE) { pruneCareer(c); json = JSON.stringify(c); }
  try {
    localStorage.setItem(SAVE_KEY, json);
    return { ok: true, size: json.length };
  } catch {
    // 容量不足などで保存できなかった.一度整理して,もう一度だけ試す
    try { pruneCareer(c); json = JSON.stringify(c); localStorage.setItem(SAVE_KEY, json); return { ok: true, size: json.length }; } catch { return { ok: false, size: json.length }; }
  }
}

/** 保存されているセーブ(文字列のまま).バックアップ用. */
export function rawSave(): string | null {
  try { return localStorage.getItem(SAVE_KEY); } catch { return null; }
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
    // v8: 年俸,GMの信頼度,解任を追加
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
  if (c.version === 15) {
    // v16: メジャーリーグを追加
    addMissingLeagues(c as unknown as Career);
    c.version = 16;
  }
  if (c.version === 16) {
    // v17: オーナーの目標を追加
    const cc = c as unknown as Career;
    // 目標は,作れなければ空のまま(次のシーズンから出る)
    try { cc.goals = cc.phase === 'season' ? makeGoals(cc) : []; } catch { cc.goals = []; }
    c.version = 17;
  }
  if (c.version === 17) {
    // v18: 選手の性格とやる気,二塁打・三塁打の記録,スカウト,契約更改を追加
    const cc = c as unknown as Career;
    const all: Player[] = [...cc.teams.flatMap((t) => t.players), ...cc.fa];
    for (const p of all) {
      p.pers ??= PERS_KEYS[Math.abs(p.id * 2654435761) % PERS_KEYS.length];
      p.morale ??= 60;
      p.stats.d2 ??= 0; p.stats.t3 ??= 0;
      for (const l of p.seasons) { l.stats.d2 ??= 0; l.stats.t3 ??= 0; }
    }
    cc.scout = null; cc.watch = [];
    c.version = 18;
  }
  if (c.version === 18) {
    // v19: 周回(殿堂入りのあとの引き継ぎ)を追加
    Object.assign(c, { gen: 1, legacy: null });
    c.version = 19;
  }
  if (c.version === 19) {
    // v20: 最上位リーグの地区を追加
    addDivisions(c as unknown as Career);
    c.version = 20;
  }
  if (c.version === 20) {
    // v21: 監督・コーチ(スタッフ)を追加
    const cc = c as unknown as Career;
    cc.staff = emptyStaff();
    cc.staffPool = [];
    if (cc.auto) cc.auto.mode = 'form';
    try { refreshPool(cc); } catch { /* 候補は次のシーズンから */ }
    c.version = 21;
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

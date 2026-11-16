import { emptyStaff, newRecords, SAVE_VERSION, snapshotYear } from './league/season';
import { refreshPool } from './league/staff';
import { refreshHelpers } from './league/trade';
import type { Player } from './types';
import { emptyPantry } from './growth/meals';
import { pickRival } from './league/awards';
import { makeGoals } from './league/goals';
import { emptyFac, emptyMarket } from './league/economy';
import { scheduleWeeks, SEASON_START } from './league/calendar';
import { refillMissions } from './league/missions';
import { addDivisions, addMissingLeagues, aiChem, fillOtherLeagues, isLegacyShape, resetLeague } from './league/world';
import { LEAGUES, LEGACY_TIER, TEAM_NAMES } from './data/constants';
import { cupOfTier } from './data/cups';
import { genTeam } from './league/team';
import { ri } from './util/random';
import { genAbilities } from './growth/abilities';
import { PERS_KEYS } from './growth/personality';
import { playerValue, salaryOf } from './growth/player';
import type { Career } from './types';
import { idbDel, idbGet, idbReady, idbSet } from './storage';
import { market } from './league/fans';

const SAVE_KEY = 'baseball-manager-sim/save';

/** この文字数を超えたら,古い記録を整理する(localStorage の容量はおよそ 500 万文字) */
export const SIZE_PRUNE = 2_400_000;
/** これを超えたら,バックアップをすすめる */
export const SIZE_WARN = 3_500_000;
/** IndexedDB に保存できるときの目安(ずっと大きく保存できる) */
const IDB_PRUNE = 20_000_000, IDB_WARN = 30_000_000;

/** IndexedDB に保存しているか(initStorage のあとで決まる) */
let useIdb = false;
/** 最後に保存・読み込みしたセーブ(バックアップ用にすぐ取り出せるように) */
let cache: string | null = null;
/** IndexedDB への最後の書き込みが成功したか */
let lastOk = true;

export const sizeWarn = (): number => (useIdb ? IDB_WARN : SIZE_WARN);
const sizePrune = (): number => (useIdb ? IDB_PRUNE : SIZE_PRUNE);

function lsGet(): string | null {
  try { return localStorage.getItem(SAVE_KEY); } catch { return null; }
}
function lsDel(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* 無視 */ }
}

/**
 * 起動時に呼ぶ.IndexedDB が使えればそこから読み込む.
 * まだ localStorage にだけセーブがあるときは IndexedDB へ写し,書き込みが確かめられてから localStorage の分を消す.
 */
export async function initStorage(): Promise<Career | null> {
  useIdb = await idbReady();
  if (!useIdb) return loadCareer();
  let raw = await idbGet(SAVE_KEY);
  const old = lsGet();
  if (!raw && old) {
    raw = old;
    if (await idbSet(SAVE_KEY, old)) lsDel();
  } else if (raw && old) {
    // 両方あるとき(ほかの方法で localStorage に入れられたなど)は,localStorage を新しいものとして扱う
    raw = old;
    if (await idbSet(SAVE_KEY, old)) lsDel();
  }
  cache = raw;
  try { return raw ? migrate(JSON.parse(raw)) : null; } catch { return null; }
}

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
  if (json.length > sizePrune()) { pruneCareer(c); json = JSON.stringify(c); }
  cache = json;
  if (useIdb) {
    // 書き込みは裏で行う.失敗したら localStorage に入れてみて,結果を次の保存のときに知らせる
    const snap = json;
    void idbSet(SAVE_KEY, snap).then((ok) => {
      if (ok) { lastOk = true; return; }
      try { localStorage.setItem(SAVE_KEY, snap); lastOk = true; } catch { lastOk = false; }
    });
    return { ok: lastOk, size: json.length };
  }
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
  return cache ?? lsGet();
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
  if (c.version === 21) {
    // v22: 練習の決め方(おまかせ・固定・手動)を追加
    const cc = c as unknown as Career;
    if (cc.auto) { cc.auto.train = 'recommend'; cc.auto.fixed = 'mix'; }
    c.version = 22;
  }
  if (c.version === 22) {
    // v23: 名場面アルバム,収支の記録を追加
    Object.assign(c, { album: [], ledger: [] });
    c.version = 23;
  }
  if (c.version === 23) {
    // v24: 助っ人,複数年契約を追加
    const cc = c as unknown as Career;
    cc.helpers = [];
    try { refreshHelpers(cc); } catch { /* 次のシーズンから */ }
    c.version = 24;
  }
  if (c.version === 24) {
    // v25: プロとメジャーが 2 地区(A・B)で 12 チームに.足りないチームは次のシーズンから加わる
    addDivisions(c as unknown as Career);
    c.version = 25;
  }
  if (c.version === 25) {
    // v26: 階層が 6 つに(市民リーグを追加).下の階層は地域ごとのリーグに分かれ,年末の選手権は 3 つに
    migrateV25(c as unknown as Career);
    c.version = 26;
  }
  if (c.version === 26) {
    // v27: 月の方針(plan)と二軍(farm)を追加.どちらもなくても動くので,足すだけ
    (c as unknown as Career).plan ??= null;
    c.version = 27;
  }
  if (c.version === 27) {
    // v28: チームの戦術を追加(なければバランス)
    (c as unknown as Career).tactic ??= 'balance';
    (c as unknown as Career).tacticFam ??= 100;
    c.version = 28;
  }
  if (c.version === 28) {
    // v29: ファンの数を追加.いまの階層の市場の大きさと,これまでの人気(収入の倍率)から始める
    const cc = c as unknown as Career;
    cc.fans ??= Math.round(market(cc.level) * 0.6 * (cc.revenue ?? 1));
    c.version = 29;
  }
  if (c.version === 29) {
    // v30: 球団の歴史(シーズン記録,球団殿堂)を追加.これからの記録を残す
    (c as unknown as Career).franchise ??= { best: {}, hall: [], hired: [] };
    c.version = 30;
  }
  if (c.version === 30) {
    // v31: トレードの申し出は 1 シーズンに 1 回まで(その記録を足す.なくても動く)
    c.version = 31;
  }
  if (c.version === SAVE_VERSION && (c as unknown as Career).rival === null) pickRival(c as unknown as Career);
  return c.version === SAVE_VERSION ? (c as unknown as Career) : null;
}

/**
 * v26: 昔の 5 階層の番号を,6 階層の番号に直す(社会人から上が 1 つずつ上がる).
 * 空いた市民リーグは 1 リーグ 6 チームで作る.地域ごとのリーグとチームの追加は,次のシーズンの開幕で行う.
 */
export function migrateV25(c: Career): void {
  // すでに新しい形なら(テストなどで作ったデータ),何もしない
  if (!isLegacyShape(c)) return;
  const tier = (l: number): number => LEGACY_TIER[l] ?? l;
  c.level = tier(c.level);
  for (const lg of c.leagues) { lg.level = tier(lg.level); lg.sub = 0; }
  const players = [...c.teams.flatMap((t) => t.players), ...c.fa, ...c.watch];
  for (const p of players) for (const x of p.seasons) x.level = tier(x.level);
  for (const h of c.hist) h.level = tier(h.level);
  for (const x of c.champs) x.level = tier(x.level);
  for (const x of c.awards) x.level = tier(x.level);
  for (const x of c.legends) x.level = tier(x.level);
  for (const x of c.cups) { x.championLevel = tier(x.championLevel); x.kind ??= 'ama'; }
  const titles = LEAGUES.map(() => 0);
  c.rec.titles.forEach((n, i) => { titles[tier(i)] += n; });
  c.rec.titles = titles;
  if (c.off) {
    c.off.from = tier(c.off.from);
    c.off.to = tier(c.off.to);
    for (const id of Object.keys(c.off.next)) c.off.next[Number(id)] = tier(c.off.next[Number(id)]);
  }
  // 実績の名前も,階層の番号で付いているので付け直す(上の階層から順に)
  for (let l = LEGACY_TIER.length - 1; l >= 0; l--) {
    for (const k of [`up${l}`, `title${l}`]) {
      if (!(k in c.ach)) continue;
      const v = c.ach[k];
      delete c.ach[k];
      c.ach[k.replace(String(l), String(tier(l)))] = v;
    }
  }
  if (c.cup) c.cup.kind = cupOfTier(c.level).kind;
  c.sideCups = [];
  // 市民リーグ(新しい階層 1)
  const L = LEAGUES[1];
  const used = new Set(c.teams.map((t) => t.name));
  const ts = TEAM_NAMES[1].filter((n) => !used.has(n)).slice(0, L.teams).map((nm) => genTeam(c, nm, L.base + ri(-4, 4), aiChem(1)));
  c.teams.push(...ts);
  const lg: Career['leagues'][0] = { level: 1, sub: 0, teamIds: ts.map((t) => t.id), schedule: [], stand: {}, week: 0, weeks: [], po: null, rankHist: {} };
  resetLeague(lg);
  c.leagues.push(lg);
  c.leagues.sort((a, b) => a.level - b.level);
  if (c.off) for (const t of ts) c.off.next[t.id] = 1;
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
    const s = lsGet();
    cache = s;
    return s ? migrate(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  cache = null;
  lsDel();
  void idbDel(SAVE_KEY);
}

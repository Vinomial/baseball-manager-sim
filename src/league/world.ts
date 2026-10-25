/**
 * 世界の進行.プレイヤーのいるリーグ以外も,毎シーズン同じチーム・選手が続く.
 * 週ごとの試合,プレーオフ,昇格・降格,加齢,ドラフト,自由契約を扱う.
 */
import { DRAFT_ROUNDS, LEAGUES, MIN_FIELDERS, MIN_PITCHERS, rosterMax, TEAM_NAMES } from '../data/constants';
import { newGame, stepToEnd } from '../engine/game';
import { agePlayer, futureValue, genPlayer, growAttr, keysOf, playerValue } from '../growth/player';
import type { Career, ChampRow, DraftState, LeagueState, Player, Team } from '../types';
import { clamp, pick, randn, ri, shuffle } from '../util/random';
import { applyGameResultToStanding } from './result';
import { emptyStanding, leagueOfTeam, makeSchedule, standings, teamById } from './schedule';
import { fielders, genTeam, ovr, pitchersOf } from './team';

/** 昇格・降格するチーム数(上位 k チームが上がり,下位 k チームが下がる) */
export const MOVES = 2;
/** AI チームが1シーズンで練習から得る成長(週数で割って使う) */
export const AI_SEASON_GAIN = 3;

/** AI チームの連携の初期値はリーグが上がるほど高い */
export const aiChem = (level: number): number => 20 + level * 12;

/* ===== 世界の作成 ===== */

export function resetLeague(lg: LeagueState): void {
  const L = LEAGUES[lg.level];
  lg.schedule = makeSchedule(shuffle(lg.teamIds), L.rounds);
  lg.stand = {};
  for (const id of lg.teamIds) lg.stand[id] = emptyStanding();
  lg.week = 0;
}

/** 4つのリーグを作る.プレイヤーのチームは最下位リーグに入る. */
export function buildWorld(c: Career, user: Team): void {
  c.teams = [user];
  c.leagues = [];
  LEAGUES.forEach((L, level) => {
    const n = L.teams - (level === 0 ? 1 : 0);
    const names = shuffle(TEAM_NAMES[level]).filter((x) => x !== user.name).slice(0, n);
    const ts = names.map((nm) => genTeam(c, nm, L.base + ri(-4, 4), aiChem(level)));
    c.teams.push(...ts);
    c.leagues.push({
      level, teamIds: [...(level === 0 ? [user.id] : []), ...ts.map((t) => t.id)], schedule: [], stand: {}, week: 0,
    });
  });
  for (const lg of c.leagues) resetLeague(lg);
}

/**
 * 古いセーブに足りないリーグを作る.プレイヤーのリーグは既存のものを使う.
 * fresh のときは,プレイヤーのリーグも新しく作ってプレイヤーを加える.
 */
export function fillOtherLeagues(c: Career, userLeague: LeagueState, fresh = false): void {
  const user = c.teams.find((t) => t.user);
  c.leagues = [];
  LEAGUES.forEach((L, level) => {
    if (level === c.level && !fresh) { c.leagues.push(userLeague); return; }
    const isUser = level === c.level;
    const names = shuffle(TEAM_NAMES[level]).filter((x) => x !== user?.name).slice(0, L.teams - (isUser ? 1 : 0));
    const ts = names.map((nm) => genTeam(c, nm, L.base + ri(-4, 4), aiChem(level)));
    c.teams.push(...ts);
    const ids = [...(isUser && user ? [user.id] : []), ...ts.map((t) => t.id)];
    const lg: LeagueState = { level, teamIds: ids, schedule: [], stand: {}, week: 0 };
    resetLeague(lg);
    c.leagues.push(lg);
  });
}

/* ===== 週ごとの進行 ===== */

/** AI チームの練習.リーグの試合数が違っても,1シーズンの成長量はほぼ同じになる. */
function aiTrain(t: Team, mult: number): void {
  for (const p of t.players) for (const k of keysOf(p)) growAttr(p, k, mult);
}

/** リーグの1週分を進める.プレイヤーの試合は skipUser で除く(別に行うため). */
export function playRound(c: Career, lg: LeagueState, skipUser: boolean): void {
  for (const [h, a] of lg.schedule[lg.week]) {
    if (skipUser && (h === c.userId || a === c.userId)) continue;
    const g = newGame(teamById(c, h), teamById(c, a), false);
    stepToEnd(g);
    applyGameResultToStanding(c, g);
  }
  const mult = AI_SEASON_GAIN / lg.schedule.length;
  for (const id of lg.teamIds) {
    const t = teamById(c, id);
    for (const p of t.players) p.fatigue = Math.max(0, p.fatigue - 45);
    if (!t.user) aiTrain(t, mult);
  }
  lg.week++;
}

/** プレイヤーのリーグの進み具合に合わせて,他のリーグも進める. */
export function advanceWorld(c: Career): void {
  const u = c.leagues[c.level];
  for (const lg of c.leagues) {
    if (lg === u) continue;
    const target = c.week >= u.schedule.length ? lg.schedule.length : Math.floor((c.week * lg.schedule.length) / u.schedule.length);
    while (lg.week < target) playRound(c, lg, false);
  }
}

/* ===== プレーオフ ===== */

function playSeriesGame(home: Team, away: Team): boolean {
  for (const t of [home, away]) for (const p of t.players) p.fatigue = 0;
  const g = newGame(home, away, false);
  stepToEnd(g);
  // プレーオフの成績はシーズンの成績に入れない
  for (const t of [home, away]) for (const p of t.players) if (g.snap[p.id]) p.stats = { ...g.snap[p.id] };
  home.rotIdx++; away.rotIdx++;
  return g.home.runs !== g.away.runs ? g.home.runs > g.away.runs : pick([true, false]);
}

/** 先に wins 勝した方(上位シードを先にホーム)が勝つ. */
function playSeries(hi: Team, lo: Team, wins: number): Team {
  let a = 0, b = 0, i = 0;
  while (a < wins && b < wins) {
    const hiHome = i % 2 === 0 || i === wins * 2 - 2;
    const hiWon = hiHome ? playSeriesGame(hi, lo) : !playSeriesGame(lo, hi);
    if (hiWon) a++; else b++;
    i++;
  }
  return a > b ? hi : lo;
}

export interface PlayoffResult { champion: Team; runnerUp: Team; semis: Team[]; }

/** 上位4チームのプレーオフ(準決勝は3戦先に2勝,決勝は5戦先に3勝). */
export function runPlayoffs(c: Career, level: number): PlayoffResult {
  const top = standings(c, level).map((r) => r.t);
  const [s1, s2, s3, s4] = top;
  const w1 = playSeries(s1, s4, 2), w2 = playSeries(s2, s3, 2);
  const hiFirst = top.indexOf(w1) < top.indexOf(w2);
  const champion = hiFirst ? playSeries(w1, w2, 3) : playSeries(w2, w1, 3);
  return { champion, runnerUp: champion === w1 ? w2 : w1, semis: [s1, s2, s3, s4] };
}

export function playoffText(c: Career, level: number, r: PlayoffResult): string {
  const me = c.userId;
  if (r.champion.id === me) return `プレーオフを勝ち抜き,${LEAGUES[level].name}で優勝!`;
  if (r.runnerUp.id === me) return 'プレーオフ決勝で敗れ,準優勝でした.';
  if (r.semis.some((t) => t.id === me)) return 'プレーオフ準決勝で敗退しました.';
  return 'プレーオフには進めませんでした.';
}

export function champRow(c: Career, level: number, r: PlayoffResult): ChampRow {
  return { season: c.season, level, team: r.champion.name, teamId: r.champion.id, runnerUp: r.runnerUp.name };
}

/* ===== 昇格・降格 ===== */

/** 全チームの来シーズンのリーグ.上位 MOVES チームが上がり,上のリーグの下位 MOVES チームが下がる. */
export function computeNextLevels(c: Career): Record<number, number> {
  const next: Record<number, number> = {};
  for (const lg of c.leagues) for (const id of lg.teamIds) next[id] = lg.level;
  for (let l = 0; l < LEAGUES.length - 1; l++) {
    const lower = standings(c, l), upper = standings(c, l + 1);
    for (const r of lower.slice(0, MOVES)) next[r.t.id] = l + 1;
    for (const r of upper.slice(-MOVES)) next[r.t.id] = l;
  }
  return next;
}

/* ===== 加齢,引退,ドラフト,自由契約 ===== */

export function archiveSeason(c: Career, t: Team, level: number): void {
  for (const p of t.players) {
    if (p.stats.g > 0) p.seasons.push({ season: c.season, level, team: t.name, age: p.age, stats: { ...p.stats } });
  }
}

/** 1年分の加齢.引退した選手の名前を返す. */
export function ageTeam(t: Team): Player[] {
  const out: Player[] = [];
  for (const p of [...t.players]) {
    if (agePlayer(p)) { out.push(p); t.players = t.players.filter((x) => x !== p); }
  }
  t.pitchers = t.pitchers.filter((id) => t.players.some((p) => p.id === id));
  t.lineup = t.lineup.filter((e) => t.players.some((p) => p.id === e.pid));
  return out;
}

/** 戦力外.AI チームが,控えの中から年齢や力の面で見込みの薄い選手を自由契約にする. */
export function aiRelease(c: Career, t: Team): void {
  const core = new Set<number>([...t.lineup.map((e) => e.pid), ...t.pitchers.slice(0, 5)]);
  const avg = t.players.reduce((s, p) => s + playerValue(p), 0) / t.players.length;
  const cands = t.players.filter((p) => !core.has(p.id) && (p.age >= 31 || futureValue(p) < avg - 8))
    .sort((a, b) => futureValue(a) - futureValue(b));
  for (const p of cands.slice(0, ri(0, 3))) {
    if (p.role === '野手' && fielders(t).length <= MIN_FIELDERS) continue;
    if (p.role === '投手' && pitchersOf(t).length <= MIN_PITCHERS) continue;
    toFreeAgent(c, t, p);
  }
}

/** 選手をチームから外して自由契約市場に出す. */
export function toFreeAgent(c: Career, t: Team, p: Player): void {
  t.players = t.players.filter((x) => x !== p);
  t.pitchers = t.pitchers.filter((id) => id !== p.id);
  t.lineup = t.lineup.filter((e) => e.pid !== p.id);
  p.prev = t.name;
  c.fa.push(p);
}

export function genDraftClass(c: Career, level: number): Player[] {
  const n = LEAGUES[level].teams * DRAFT_ROUNDS + 4;
  const base = LEAGUES[level].base - 8;
  return Array.from({ length: n }, (_, i) => {
    const p = genPlayer(c, i % 3 === 2 ? '投手' : '野手', base, { age: ri(18, 22), potMul: 0.7 });
    p.scout = {};
    for (const k of keysOf(p)) {
      const e = ri(4, 10);
      p.scout[k] = [clamp(Math.round(p[k] - ri(0, e)), 1, 99), clamp(Math.round(p[k] + ri(0, e)), 1, 99)];
    }
    const ks = keysOf(p);
    const pot = ks.reduce((s, k) => s + p.pot[k], 0) / ks.length;
    const e = ri(3, 9);
    p.scoutPot = [clamp(Math.round(pot - ri(0, e)), 1, 99), clamp(Math.round(pot + ri(0, e)), 1, 99)];
    return p;
  });
}

/** チームが欲しい度合い.将来性に,弱いポジションの補強を足す. */
export function draftScore(t: Team, p: Player): number {
  const same = t.players.filter((x) => x.role === p.role);
  const worst = same.length ? Math.min(...same.map(playerValue)) : 0;
  const need = p.role === '投手' && pitchersOf(t).length < 7 ? 3 : 0;
  return futureValue(p) + Math.max(0, playerValue(p) - worst) * 0.3 + need;
}

/** 指名順.弱いチームから.2巡目は逆順. */
export function draftOrder(c: Career, ids: number[]): number[] {
  const asc = [...ids].sort((a, b) => ovr(teamById(c, a)) - ovr(teamById(c, b)));
  const out: number[] = [];
  for (let r = 0; r < DRAFT_ROUNDS; r++) out.push(...(r % 2 ? [...asc].reverse() : asc));
  return out;
}

export function signDraftee(t: Team, p: Player): void {
  delete p.scout;
  delete p.scoutPot;
  t.players.push(p);
  if (p.role === '投手') t.pitchers.push(p.id);
}

/** プレイヤーの番が来るまで,AI チームの指名を進める. */
export function advanceDraft(c: Career, d: DraftState): void {
  while (d.idx < d.order.length) {
    const teamId = d.order[d.idx];
    if (teamId === c.userId) return;
    const t = teamById(c, teamId);
    if (!d.pool.length) { d.idx = d.order.length; break; }
    const best = d.pool.map((p) => ({ p, v: draftScore(t, p) + randn() * 2 })).sort((a, b) => b.v - a.v)[0].p;
    takePick(c, d, t, best);
  }
  finishDraft(c, d);
}

function takePick(c: Career, d: DraftState, t: Team, p: Player): void {
  const round = Math.floor(d.idx / (d.order.length / DRAFT_ROUNDS)) + 1;
  d.pool = d.pool.filter((x) => x !== p);
  d.picks.push({ round, teamId: t.id, team: t.name, pid: p.id, name: p.name, user: t.id === c.userId });
  signDraftee(t, p);
  d.idx++;
}

/** プレイヤーが指名する(i が候補の位置).-1 なら見送り. */
export function userDraftPick(c: Career, d: DraftState, i: number): void {
  if (d.done || d.order[d.idx] !== c.userId) return;
  if (i < 0 || !d.pool[i]) { d.idx++; } else takePick(c, d, teamById(c, c.userId), d.pool[i]);
  advanceDraft(c, d);
}

function finishDraft(c: Career, d: DraftState): void {
  if (d.idx < d.order.length || d.done) return;
  d.done = true;
  for (const p of d.pool) { delete p.scout; delete p.scoutPot; p.prev = '未指名'; c.fa.push(p); }
  d.pool = [];
}

/** AI だけのリーグのドラフトを,最後まで行う. */
export function runAiDraft(c: Career, level: number, ids: number[]): void {
  const d: DraftState = { pool: genDraftClass(c, level), order: draftOrder(c, ids), idx: 0, picks: [], done: false };
  advanceDraft(c, d);
}

/* ===== 自由契約 ===== */

/** AI チームが,足りない人数を自由契約から補い,控えより明らかに良い選手がいれば加える. */
export function aiSignFreeAgents(c: Career, next: Record<number, number>): void {
  for (const t of shuffle(c.teams.filter((x) => !x.user))) {
    const lv = next[t.id] ?? 0, cap = rosterMax(lv);
    const catchers = () => fielders(t).filter((p) => p.pos === '捕').length;
    const sign = (role: '野手' | '投手', prefer?: (p: Player) => boolean) => {
      const pool = c.fa.filter((p) => p.role === role);
      const pref = prefer ? pool.filter(prefer) : [];
      const from = pref.length ? pref : pool;
      if (!from.length) return false;
      const best = from.reduce((a, b) => (futureValue(b) > futureValue(a) ? b : a));
      c.fa = c.fa.filter((x) => x !== best);
      delete best.prev;
      t.players.push(best);
      if (best.role === '投手') t.pitchers.push(best.id);
      return true;
    };
    while (fielders(t).length < 13 + lv && t.players.length < cap) {
      if (!sign('野手', catchers() < 2 ? (p) => p.pos === '捕' : undefined)) break;
    }
    while (pitchersOf(t).length < 7 + lv && t.players.length < cap) if (!sign('投手')) break;
    trimRoster(c, t, cap);
  }
}

/** 登録上限を超えた分を,控えの下位から自由契約にする. */
export function trimRoster(c: Career, t: Team, cap: number): void {
  while (t.players.length > cap) {
    const core = new Set<number>([...t.lineup.map((e) => e.pid), ...t.pitchers.slice(0, 5)]);
    const rest = t.players.filter((p) => !core.has(p.id)).sort((a, b) => futureValue(a) - futureValue(b));
    if (!rest.length) break;
    toFreeAgent(c, t, rest[0]);
  }
}

/** 自由契約の市場を整理する.古い選手や力のない選手は市場から消える. */
export function pruneFreeAgents(c: Career): void {
  c.fa = c.fa.filter((p) => p.age < 36).sort((a, b) => futureValue(b) - futureValue(a)).slice(0, 40);
}

/** 自分のチームに入ってもらえるか.強いチーム・上のリーグほど選手が来てくれる. */
export function faAppeal(c: Career): number {
  const o = c.off;
  const level = o ? o.to : c.level;
  const rank = o ? o.rank : 3;
  return LEAGUES[level].base + (LEAGUES[level].teams + 1 - rank) * 1.2;
}

export const faDemand = (p: Player): number => playerValue(p) - 10 - (p.age >= 33 ? 4 : 0);

export function faVerdict(c: Career, p: Player): 'ok' | 'hard' {
  return faAppeal(c) >= faDemand(p) ? 'ok' : 'hard';
}

export function teamLevel(c: Career, t: Team): number {
  return leagueOfTeam(c, t.id).level;
}

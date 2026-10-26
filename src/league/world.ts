/**
 * 世界の進行.プレイヤーのいるリーグ以外も,毎シーズン同じチーム・選手が続く.
 * 週ごとの試合,プレーオフ,昇格・降格,加齢,ドラフト,自由契約を扱う.
 */
import { DIFFS, DRAFT_ROUNDS, LABEL, MOVES, LEAGUES, MIN_FIELDERS, MIN_PITCHERS, rosterMax, TEAM_NAMES } from '../data/constants';
import { newGame, stepToEnd } from '../engine/game';
import { agePlayer, condDrift, driftPot, futureValue, genPlayer, growAttr, keysOf, playerValue } from '../growth/player';
import type { AttrKey, Career, DraftState, Game, LeagueState, Player, Team } from '../types';
import { clamp, pick, randn, ri, shuffle } from '../util/random';
import { heal, isHurt, maybeInjure } from './health';
import { applyGameEffects, applyGameResultToStanding } from './result';
import { scheduleWeeks, WEEKS_PER_YEAR } from './calendar';
import { emptyStanding, leagueOfTeam, makeSchedule, standings, teamById } from './schedule';
import { fielders, genTeam, ovr, pitchersOf } from './team';

/** AI チームが1シーズンで練習から得る成長(週数で割って使う) */
export const AI_YEAR_GAIN = [2.7, 3.3, 4.3, 5.6, 6.3];

/** AI チームの連携の初期値はリーグが上がるほど高い */
export const aiChem = (level: number): number => 20 + level * 12;

/* ===== 世界の作成 ===== */

export function resetLeague(lg: LeagueState): void {
  const L = LEAGUES[lg.level];
  lg.schedule = makeSchedule(shuffle(lg.teamIds), L.rounds);
  lg.weeks = scheduleWeeks(lg.schedule.length);
  lg.po = null;
  lg.rankHist = {};
  // 上位のリーグは 2 つの地区(A・B リーグ)に分ける
  if (L.divs && lg.teamIds.length >= 6) {
    const ids = shuffle(lg.teamIds);
    const half = Math.ceil(ids.length / 2);
    lg.divs = [ids.slice(0, half), ids.slice(half)];
  } else lg.divs = undefined;
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
      level, teamIds: [...(level === 0 ? [user.id] : []), ...ts.map((t) => t.id)], schedule: [], stand: {}, week: 0, weeks: [], po: null, rankHist: {},
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
    const lg: LeagueState = { level, teamIds: ids, schedule: [], stand: {}, week: 0, weeks: [], po: null, rankHist: {} };
    resetLeague(lg);
    c.leagues.push(lg);
  });
}

/* ===== 週ごとの進行 ===== */

/** AI チームの練習.1 年の成長量は,リーグの試合数に関わらずほぼ同じになる. */
function aiTrain(t: Team, mult: number): void {
  for (const p of t.players) for (const k of keysOf(p)) growAttr(p, k, mult);
}

/** リーグの 1 節(1 週ぶんの全カード)を進める.プレイヤーの試合は skipUser で除く(別に行うため). */
export function playRound(c: Career, lg: LeagueState, skipUser: boolean): void {
  for (const [h, a] of lg.schedule[lg.week]) {
    if (skipUser && (h === c.userId || a === c.userId)) continue;
    const g = newGame(teamById(c, h), teamById(c, a), false);
    stepToEnd(g);
    applyGameResultToStanding(c, g);
  }
  lg.week++;
  // 順位の遷移を記録する
  standings(c, lg.level).forEach((r, i) => { (lg.rankHist[r.t.id] ??= []).push(i + 1); });
}

/** 暦の週が進むたびに,すべてのチームで行うこと.疲れの回復,AI の練習と調子. */
export function weeklyUpkeep(c: Career, menuRisk = 1): void {
  for (const lg of c.leagues) {
    const mult = (AI_YEAR_GAIN[lg.level] * DIFFS[c.diff].ai) / WEEKS_PER_YEAR;
    for (const id of lg.teamIds) {
      const t = teamById(c, id);
      const med = t.med ?? 0;
      for (const p of t.players) {
        // AI チームも練習で疲れる
        if (!t.user) p.fatigue = Math.min(100, p.fatigue + 11);
        p.fatigue = Math.max(0, p.fatigue - 18);
        if (heal(p, med) && t.user) c.news.push(`${p.name}の怪我が治りました.`);
        else if (!isHurt(p) && maybeInjure(p, 0.0025 * (t.user ? menuRisk : 1), med) && t.user) {
          c.news.push(`${p.name}が${p.inj!.name}で${p.inj!.weeks}週間の離脱です.`);
          if (p.inj!.major) (p.story ??= []).push({ season: c.season, text: `${p.inj!.name}の大怪我で長期離脱した.` });
        }
      }
      if (!t.user) { aiTrain(t, mult); for (const p of t.players) condDrift(p, 0); }
    }
  }
}

/** この週に予定されているリーグ戦を進める(プレイヤーの試合は済んでいれば除く). */
export function stepLeagues(c: Career, userPlayed: boolean): void {
  for (const lg of c.leagues) {
    while (lg.week < lg.schedule.length && lg.weeks[lg.week] <= c.cal) {
      const mine = lg.level === c.level && userPlayed && lg.weeks[lg.week] === c.cal;
      playRound(c, lg, mine);
      if (mine) break;
    }
  }
}

/* ===== プレーオフ(上位 4 チーム.準決勝は 3 戦先に 2 勝,決勝は 5 戦先に 3 勝) ===== */

/** 公式戦の 1 試合を行う.引き分けならやり直し.成績には入るが順位には入らない. */
function playOfficial(c: Career, home: Team, away: Team, log: boolean): Game {
  let g = newGame(home, away, log);
  for (let i = 0; i < 3; i++) {
    stepToEnd(g);
    if (g.home.runs !== g.away.runs) break;
    g = newGame(home, away, log);
  }
  if (g.home.runs === g.away.runs) g.home.runs += pick([0, 1]) ? 0 : 1;
  applyGameEffects(g);
  void c;
  return g;
}

export interface SeriesResult { winner: Team; /** プレイヤーが出た試合(実況付き) */ games: Game[]; /** 最後の試合 */ last: Game; }

/** 先に wins 勝した方が勝つ.上位シードが先にホーム.プレイヤーが出る試合は実況付き. */
export function playSeries(c: Career, hi: Team, lo: Team, wins: number): SeriesResult {
  let a = 0, b = 0, i = 0;
  const games: Game[] = [];
  let last!: Game;
  const log = hi.user || lo.user;
  while (a < wins && b < wins) {
    const hiHome = i % 2 === 0 || i === wins * 2 - 2;
    const g = hiHome ? playOfficial(c, hi, lo, log) : playOfficial(c, lo, hi, log);
    const hiWon = hiHome ? g.home.runs > g.away.runs : g.away.runs > g.home.runs;
    if (log) games.push(g);
    last = g;
    if (hiWon) a++; else b++;
    i++;
  }
  return { winner: a > b ? hi : lo, games, last };
}

/** プレーオフに進む 4 チーム.地区があれば,各地区の上位 2 チーム(地区優勝が上位シード). */
export function playoffSeeds(c: Career, lg: LeagueState): number[] {
  const tbl = standings(c, lg.level);
  if (!lg.divs) return tbl.slice(0, 4).map((r) => r.t.id);
  const inDiv = lg.divs.map((d) => tbl.filter((r) => d.includes(r.t.id)).map((r) => r.t.id));
  const winners = inDiv.map((d) => d[0]).sort((a, b) => tbl.findIndex((r) => r.t.id === a) - tbl.findIndex((r) => r.t.id === b));
  const seconds = inDiv.map((d) => d[1]).sort((a, b) => tbl.findIndex((r) => r.t.id === a) - tbl.findIndex((r) => r.t.id === b));
  return [...winners, ...seconds];
}

/** 週のはじめにプレーオフの組み合わせを決める */
export function startPlayoffs(c: Career): void {
  for (const lg of c.leagues) {
    lg.po = { seeds: playoffSeeds(c, lg), semiWinners: [], champion: null, runnerUp: null };
  }
}

/** その週のプレーオフを,全リーグ分進める.プレイヤーが出る試合(実況付き)を返す. */
export function playPlayoffWeek(c: Career, stage: 'semi' | 'final'): Game[] {
  const out: Game[] = [];
  for (const lg of c.leagues) {
    const po = lg.po;
    if (!po) continue;
    const T = (id: number) => teamById(c, id);
    if (stage === 'semi') {
      po.semiWinners = [[0, 3], [1, 2]].map(([x, y]) => {
        const r = playSeries(c, T(po.seeds[x]), T(po.seeds[y]), 2);
        out.push(...r.games);
        return r.winner.id;
      });
    } else {
      const [x, y] = po.semiWinners;
      const hiId = po.seeds.indexOf(x) < po.seeds.indexOf(y) ? x : y;
      const loId = hiId === x ? y : x;
      const r = playSeries(c, T(hiId), T(loId), 3);
      out.push(...r.games);
      po.champion = r.winner.id;
      po.runnerUp = r.winner.id === hiId ? loId : hiId;
      c.champs.push({ season: c.season, level: lg.level, team: T(po.champion).name, teamId: po.champion, runnerUp: T(po.runnerUp).name });
    }
  }
  return out;
}

export function playoffText(c: Career, lg: LeagueState): string {
  const po = lg.po, me = c.userId;
  if (!po) return 'プレーオフには進めませんでした.';
  if (po.champion === me) return `プレーオフを勝ち抜き,${LEAGUES[lg.level].name}で優勝!`;
  if (po.runnerUp === me) return 'プレーオフ決勝で敗れ,準優勝でした.';
  if (po.seeds.includes(me)) return 'プレーオフ準決勝で敗退しました.';
  return 'プレーオフには進めませんでした.';
}

/* ===== 昇格・降格 ===== */

/** 入れ替え戦の結果(l は下のリーグ) */
export interface Swap { l: number; lower: number; upper: number; winner: number; text: string; }

/**
 * 入れ替え戦.下のリーグの2位と,上のリーグの下から2番目が 3 戦先に 2 勝で争う.
 * 勝った方が来シーズン上のリーグにいる.順位が確定してから呼ぶ.
 */
export function playSwaps(c: Career): Swap[] {
  const out: Swap[] = [];
  for (let l = 0; l < LEAGUES.length - 1; l++) {
    const lower = standings(c, l), upper = standings(c, l + 1);
    const k = MOVES[l];
    const lo = lower[k]?.t, up = upper[upper.length - 1 - k]?.t;
    if (!lo || !up) continue;
    const r = playSeries(c, up, lo, 2);
    const text = `${LEAGUES[l].name}${k + 1}位の${lo.name}と${LEAGUES[l + 1].name}の${up.name}の入れ替え戦は,${r.winner.name}が勝ちました.`;
    out.push({ l, lower: lo.id, upper: up.id, winner: r.winner.id, text });
  }
  return out;
}

/** 全チームの来シーズンのリーグ.境目ごとに,上位 MOVES[l] チームが上がり,上のリーグの下位 MOVES[l] チームが下がる.入れ替え戦に勝った方が上に残る. */
export function computeNextLevels(c: Career, swaps: Swap[] = []): Record<number, number> {
  const next: Record<number, number> = {};
  for (const lg of c.leagues) for (const id of lg.teamIds) next[id] = lg.level;
  for (let l = 0; l < LEAGUES.length - 1; l++) {
    const lower = standings(c, l), upper = standings(c, l + 1);
    const k = MOVES[l];
    for (const r of lower.slice(0, k)) next[r.t.id] = l + 1;
    for (const r of upper.slice(-k)) next[r.t.id] = l;
  }
  for (const s of swaps) {
    if (s.winner === s.lower) { next[s.lower] = s.l + 1; next[s.upper] = s.l; }
  }
  return next;
}

/** 古いセーブのリーグに足りないチームを,新しい AI チームで増やす.次のシーズンのリーグ(next)に加える. */
export function expandLeagues(c: Career, next: Record<number, number>): void {
  for (const L of LEAGUES.map((x, level) => ({ ...x, level }))) {
    const have = c.teams.filter((t) => next[t.id] === L.level).length;
    if (have >= L.teams) continue;
    const used = new Set(c.teams.map((t) => t.name));
    const names = shuffle(TEAM_NAMES[L.level]).filter((n) => !used.has(n)).slice(0, L.teams - have);
    for (const nm of names) {
      const t = genTeam(c, nm, L.base + ri(-4, 4), aiChem(L.level));
      c.teams.push(t);
      next[t.id] = L.level;
    }
  }
}

/* ===== 加齢,引退,ドラフト,自由契約 ===== */

export function archiveSeason(c: Career, t: Team, level: number): void {
  for (const p of t.players) {
    if (p.stats.g > 0) {
      const attrs: Partial<Record<AttrKey, number>> = {};
      for (const k of keysOf(p)) attrs[k] = Math.round(p[k]);
      p.seasons.push({ season: c.season, level, team: t.name, age: p.age, stats: { ...p.stats }, attrs });
    }
  }
}

/** 1年分の加齢.引退した選手の名前を返す. */
export function ageTeam(t: Team, awakened?: string[]): Player[] {
  const out: Player[] = [];
  for (const p of [...t.players]) {
    if (agePlayer(p)) { out.push(p); t.players = t.players.filter((x) => x !== p); continue; }
    const k = driftPot(p);
    if (k && awakened) awakened.push(`${p.name}が覚醒! ${LABEL[k]}の限界が大きく広がった.`);
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

export function genDraftClass(c: Career, level: number, scoutLv = 0): Player[] {
  const n = LEAGUES[level].teams * DRAFT_ROUNDS + 4;
  const base = LEAGUES[level].base - 8;
  return Array.from({ length: n }, (_, i) => {
    const p = genPlayer(c, i % 3 === 2 ? '投手' : '野手', base, { age: ri(18, 22), potMul: 0.7 });
    p.scout = {};
    for (const k of keysOf(p)) {
      const e = Math.max(1, Math.round(ri(4, 10) * (1 - scoutLv * 0.15)));
      p.scout[k] = [clamp(Math.round(p[k] - ri(0, e)), 1, 99), clamp(Math.round(p[k] + ri(0, e)), 1, 99)];
    }
    const ks = keysOf(p);
    const pot = ks.reduce((s, k) => s + p.pot[k], 0) / ks.length;
    const e = Math.max(1, Math.round(ri(3, 9) * (1 - scoutLv * 0.15)));
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
  // 新人の年俸は市場の半分
  p.salary = Math.max(50, Math.round(p.salary * 0.5 / 10) * 10);
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

/** 新人の入団会見のコメント */
export function pressNote(p: Player): string {
  const ks = keysOf(p);
  const best = ks.reduce((a, b) => (p[b] > p[a] ? b : a));
  const room = ks.reduce((s, k) => s + (p.pot[k] - p[k]), 0) / ks.length;
  const lines = p.role === '野手'
    ? [`「${LABEL[best]}なら負けません.チームの力になります!」`, '「一日でも早く試合に出たいです.」', '「憧れの舞台に立てて光栄です.」']
    : [`「${LABEL[best]}には自信があります.」`, '「まずは先発ローテーションを目指します.」', '「ファンに愛される投手になりたいです.」'];
  const tag = room >= 20 ? '【期待の新人】' : room >= 12 ? '【伸びしろ十分】' : '【即戦力候補】';
  return `${tag}${p.name} 入団会見 ${pick(lines)}`;
}

/** プレイヤーが指名する(i が候補の位置).-1 なら見送り. */
export function userDraftPick(c: Career, d: DraftState, i: number): void {
  if (d.done || d.order[d.idx] !== c.userId) return;
  if (i < 0 || !d.pool[i]) { d.idx++; } else {
    const p = d.pool[i];
    const note = pressNote(p);
    takePick(c, d, teamById(c, c.userId), p);
    c.off?.press?.push(note);
    (p.story ??= []).push({ season: c.season, text: 'ドラフトで入団した.' });
  }
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
  return LEAGUES[level].base + (LEAGUES[level].teams + 1 - rank) * 1.2 + (c.trust - 50) * 0.08;
}

export const faDemand = (p: Player): number => playerValue(p) - 10 - (p.age >= 33 ? 4 : 0);

export function faVerdict(c: Career, p: Player): 'ok' | 'hard' {
  return faAppeal(c) >= faDemand(p) ? 'ok' : 'hard';
}

export function teamLevel(c: Career, t: Team): number {
  return leagueOfTeam(c, t.id).level;
}

/** 古いセーブの最上位リーグに,地区を足す */
export function addDivisions(c: Career): void {
  for (const lg of c.leagues) {
    if (LEAGUES[lg.level].divs && !lg.divs && lg.teamIds.length >= 6) {
      const ids = shuffle(lg.teamIds);
      const half = Math.ceil(ids.length / 2);
      lg.divs = [ids.slice(0, half), ids.slice(half)];
    }
  }
}

/** 古いセーブに,あとから増えた上位のリーグを足す(AI チームだけで作る). */
export function addMissingLeagues(c: Career): void {
  for (let level = c.leagues.length; level < LEAGUES.length; level++) {
    const L = LEAGUES[level];
    const names = shuffle(TEAM_NAMES[level]).slice(0, L.teams);
    const ts = names.map((nm) => genTeam(c, nm, L.base + ri(-4, 4), aiChem(level)));
    c.teams.push(...ts);
    const lg: LeagueState = { level, teamIds: ts.map((t) => t.id), schedule: [], stand: {}, week: 0, weeks: [], po: null, rankHist: {} };
    resetLeague(lg);
    c.leagues.push(lg);
    if (c.off) for (const t of ts) c.off.next[t.id] = level;
  }
  while (c.rec.titles.length < LEAGUES.length) c.rec.titles.push(0);
}

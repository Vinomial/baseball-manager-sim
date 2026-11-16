/**
 * 世界の進行.プレイヤーのいるリーグ以外も,毎シーズン同じチーム・選手が続く.
 * 週ごとの試合,プレーオフ,昇格・降格,加齢,ドラフト,自由契約を扱う.
 */
import { DIFFS, DRAFT_ROUNDS, LABEL, LEAGUES, LEGACY_TIER, MIN_FIELDERS, MIN_PITCHERS, rosterMax, TEAM_NAMES, type League } from '../data/constants';
import { newGame, stepToEnd, stepToEndGen, type Moment, type MomentChoice } from '../engine/game';
import { agePlayer, condDrift, driftPot, futureValue, genPlayer, growAttr, keysOf, playerValue } from '../growth/player';
import type { AttrKey, Career, DraftState, Game, LeagueState, Player, Team } from '../types';
import { clamp, pick, randn, ri, shuffle } from '../util/random';
import { heal, isHurt, maybeInjure } from './health';
import { mealRest } from '../growth/meals';
import { applyGameEffects, applyGameResultToStanding } from './result';
import { scheduleWeeks, WEEKS_PER_YEAR } from './calendar';
import { foldHistory } from './leaders';
import { emptyStanding, leagueOfTeam, leaguesInTier, makeDivSchedule, makeSchedule, standings, teamById } from './schedule';
import { fielders, genTeam, ovr, pitchersOf } from './team';
import { fanAppeal } from './fans';

/** AI チームが1シーズンで練習から得る成長(週数で割って使う) */
export const AI_YEAR_GAIN = [2.7, 3.0, 3.4, 4.3, 5.6, 6.3];

/** AI チームの連携の初期値はリーグが上がるほど高い */
export const aiChem = (level: number): number => 20 + level * 12;

/* ===== 世界の作成 ===== */

/** 古いセーブ(v25 まで)の 5 階層.古いセーブを直す途中で,足りないリーグを作るときに使う. */
export const LEGACY_LEAGUES: League[] = [
  { name: '草野球リーグ', base: 32, teams: 6, rounds: 2, roster: 22, count: 1 },
  { name: '社会人リーグ', base: 44, teams: 6, rounds: 3, roster: 24, count: 1 },
  { name: '独立リーグ', base: 56, teams: 8, rounds: 3, roster: 26, count: 1 },
  { name: 'プロリーグ', base: 68, teams: 12, rounds: 2, roster: 28, divs: true, count: 1 },
  { name: 'メジャーリーグ', base: 78, teams: 12, rounds: 2, roster: 30, divs: true, count: 1 },
];
const legacyNames = (level: number): string[] => TEAM_NAMES[LEGACY_TIER[level]];

/** リーグの名前.並んでいるリーグがあれば「草野球リーグ 東」のように地域をつける. */
export function leagueName(lg: LeagueState): string {
  const L = LEAGUES[lg.level];
  return L.count > 1 && L.subs ? `${L.name} ${L.subs[lg.sub ?? 0]}` : L.name;
}

/**
 * プロ・メジャーの東西のリーグ分け.残るチームは同じリーグのまま,新しく来たチームは強い順に,
 * 空きがあって戦力の合計が低い方のリーグへ入れる(東西の強さがそろうように).teamOvr はチームの総合力.
 */
export function balanceDivs(ids: number[], prev: number[][] | undefined, teamOvr: (id: number) => number): number[][] {
  const half = Math.ceil(ids.length / 2);
  const divs: number[][] = [0, 1].map((i) => (prev?.[i] ?? []).filter((id) => ids.includes(id)));
  // 前のリーグ分けが崩れていたら(人数が多すぎるなど),はじめから分け直す
  if (divs.some((d) => d.length > half)) { divs[0] = []; divs[1] = []; }
  const placed = new Set(divs.flat());
  const movers = ids.filter((id) => !placed.has(id)).sort((a, b) => teamOvr(b) - teamOvr(a));
  const sum = (d: number[]) => d.reduce((s, id) => s + teamOvr(id), 0);
  for (const id of movers) {
    const open = divs.filter((d) => d.length < half);
    const to = (open.length ? open : divs).reduce((a, b) => (sum(b) < sum(a) ? b : a));
    to.push(id);
  }
  return divs;
}

export function resetLeague(lg: LeagueState, L: League = LEAGUES[lg.level], teamOvr: (id: number) => number = () => 0): void {
  // プロ・メジャーは東西 2 つのリーグに分け,同じリーグの相手との試合と,交流戦を行う
  if (L.divs && lg.teamIds.length >= 6 && lg.teamIds.length % 2 === 0) {
    lg.divs = balanceDivs(lg.teamIds, lg.divs, teamOvr);
    lg.schedule = makeDivSchedule(shuffle(lg.divs[0]), shuffle(lg.divs[1]), L.rounds, L.inter ?? 1);
  } else {
    lg.divs = undefined;
    lg.schedule = makeSchedule(shuffle(lg.teamIds), L.rounds);
  }
  lg.weeks = scheduleWeeks(lg.schedule.length);
  lg.po = null;
  lg.rankHist = {};
  lg.stand = {};
  for (const id of lg.teamIds) lg.stand[id] = emptyStanding();
  lg.week = 0;
}

const emptyLeague = (level: number, sub: number): LeagueState =>
  ({ level, sub, teamIds: [], schedule: [], stand: {}, week: 0, weeks: [], po: null, rankHist: {} });

/** すべての階層のリーグを作る.プレイヤーのチームは最下位の階層のどこかのリーグに入る. */
export function buildWorld(c: Career, user: Team): void {
  c.teams = [user];
  c.leagues = [];
  const userSub = ri(0, LEAGUES[0].count - 1);
  LEAGUES.forEach((L, level) => {
    const names = shuffle(TEAM_NAMES[level]).filter((x) => x !== user.name);
    for (let sub = 0; sub < L.count; sub++) {
      const mine = level === 0 && sub === userSub;
      const ts = names.splice(0, L.teams - (mine ? 1 : 0)).map((nm) => genTeam(c, nm, L.base + ri(-4, 4), aiChem(level)));
      c.teams.push(...ts);
      const lg = emptyLeague(level, sub);
      lg.teamIds = [...(mine ? [user.id] : []), ...ts.map((t) => t.id)];
      c.leagues.push(lg);
    }
  });
  for (const lg of c.leagues) resetLeague(lg, undefined, (id) => ovr(teamById(c, id)));
}

/**
 * 古いセーブに足りないリーグを作る.プレイヤーのリーグは既存のものを使う.
 * fresh のときは,プレイヤーのリーグも新しく作ってプレイヤーを加える.
 */
export function fillOtherLeagues(c: Career, userLeague: LeagueState, fresh = false): void {
  const user = c.teams.find((t) => t.user);
  c.leagues = [];
  LEGACY_LEAGUES.forEach((L, level) => {
    if (level === c.level && !fresh) { c.leagues.push(userLeague); return; }
    const isUser = level === c.level;
    const names = shuffle(legacyNames(level)).filter((x) => x !== user?.name).slice(0, L.teams - (isUser ? 1 : 0));
    const ts = names.map((nm) => genTeam(c, nm, L.base + ri(-4, 4), aiChem(level)));
    c.teams.push(...ts);
    const ids = [...(isUser && user ? [user.id] : []), ...ts.map((t) => t.id)];
    const lg: LeagueState = { level, teamIds: ids, schedule: [], stand: {}, week: 0, weeks: [], po: null, rankHist: {} };
    resetLeague(lg, L);
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
  standings(c, lg).forEach((r, i) => { (lg.rankHist[r.t.id] ??= []).push(i + 1); });
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
        // 料理(米)で,自分のチームは疲れがよけいにとれる
        p.fatigue = Math.max(0, p.fatigue - 18 - (t.user ? mealRest(c.meal) : 0));
        if (heal(p, med) && t.user) c.news.push(`${p.name}の怪我が治りました.`);
        else if (!isHurt(p) && maybeInjure(p, 0.0025 * (t.user ? menuRisk : 1), med, t.guard ?? 1) && t.user) {
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

/* ===== 公式戦のシリーズ(昇格プレーオフで使う) ===== */

/** 勝負どころで止まる試合のジェネレーター.答え(MomentChoice)を受け取って続ける. */
export type MomentGen<T> = Generator<Moment, T, MomentChoice>;

/** ジェネレーターを,勝負どころはすべて監督に任せて最後まで進める */
export function runAuto<T>(gen: MomentGen<T>): T {
  let r = gen.next('auto');
  while (!r.done) r = gen.next('auto');
  return r.value;
}

/** 公式戦の 1 試合を行う.引き分けならやり直し.成績には入るが順位には入らない.プレイヤーの試合は勝負どころで止まる. */
function* playOfficialGen(c: Career, home: Team, away: Team, log: boolean): MomentGen<Game> {
  let g = newGame(home, away, log);
  for (let i = 0; i < 3; i++) {
    if (log) yield* stepToEndGen(g); else stepToEnd(g);
    if (g.home.runs !== g.away.runs) break;
    g = newGame(home, away, log);
  }
  if (g.home.runs === g.away.runs) g.home.runs += pick([0, 1]) ? 0 : 1;
  applyGameEffects(g);
  void c;
  return g;
}

export interface SeriesResult { winner: Team; /** プレイヤーが出た試合(実況付き) */ games: Game[]; /** 最後の試合 */ last: Game; }

/** 先に wins 勝した方が勝つ.上位シードが先にホーム.プレイヤーが出る試合は実況付きで,勝負どころで止まる. */
export function* playSeriesGen(c: Career, hi: Team, lo: Team, wins: number): MomentGen<SeriesResult> {
  let a = 0, b = 0, i = 0;
  const games: Game[] = [];
  let last!: Game;
  const log = hi.user || lo.user;
  while (a < wins && b < wins) {
    const hiHome = i % 2 === 0 || i === wins * 2 - 2;
    const g = hiHome ? yield* playOfficialGen(c, hi, lo, log) : yield* playOfficialGen(c, lo, hi, log);
    const hiWon = hiHome ? g.home.runs > g.away.runs : g.away.runs > g.home.runs;
    if (log) games.push(g);
    last = g;
    if (hiWon) a++; else b++;
    i++;
  }
  return { winner: a > b ? hi : lo, games, last };
}

/** playSeriesGen を,勝負どころは監督に任せて進める */
export const playSeries = (c: Career, hi: Team, lo: Team, wins: number): SeriesResult => runAuto(playSeriesGen(c, hi, lo, wins));


/* ===== 昇格・降格(誰が動くかは promotion.ts) ===== */

/**
 * 来シーズンのリーグ分け.階層ごとにチーム数が足りなければ AI チームを足し,並ぶリーグの数もそろえる.
 * 残るチームは同じリーグにとどまり,上がってきた・下がってきたチームは空いているリーグに入る.
 */
export function arrangeLeagues(c: Career, next: Record<number, number>): void {
  LEAGUES.forEach((L, tier) => {
    // チームを足す(古いセーブや,リーグが増えたとき)
    const have = c.teams.filter((t) => next[t.id] === tier).length;
    const want = L.teams * L.count;
    if (have < want) {
      const used = new Set(c.teams.map((t) => t.name));
      const names = shuffle(TEAM_NAMES[tier]).filter((n) => !used.has(n));
      for (let i = 0; i < want - have; i++) {
        const t = genTeam(c, names[i] ?? `${L.name.replace('リーグ', '')}クラブ${i + 1}`, L.base + ri(-4, 4), aiChem(tier));
        c.teams.push(t);
        next[t.id] = tier;
      }
    }
    // リーグの数をそろえる
    const lgs = leaguesInTier(c, tier);
    lgs.forEach((lg, i) => { lg.sub ??= i; });
    for (let sub = lgs.length; sub < L.count; sub++) c.leagues.push(emptyLeague(tier, sub));
    const all = leaguesInTier(c, tier);
    // 残るチーム
    const placed = new Set<number>();
    for (const lg of all) {
      lg.teamIds = lg.teamIds.filter((id) => next[id] === tier);
      for (const id of lg.teamIds) placed.add(id);
    }
    // 動くチームを,強い順に,空きがあって戦力の平均が低いリーグへ入れる(並ぶリーグの強さがそろうように)
    const str = (id: number) => ovr(teamById(c, id));
    const avgOf = (lg: LeagueState) => (lg.teamIds.length ? lg.teamIds.reduce((s, id) => s + str(id), 0) / lg.teamIds.length : 0);
    const movers = c.teams.filter((t) => next[t.id] === tier && !placed.has(t.id)).map((t) => t.id).sort((a, b) => str(b) - str(a));
    for (const id of movers) {
      const open = all.filter((lg) => lg.teamIds.length < L.teams);
      const lg = open.length ? open.reduce((a, b) => (avgOf(b) < avgOf(a) || (avgOf(b) === avgOf(a) && b.teamIds.length < a.teamIds.length) ? b : a))
        : all.reduce((a, b) => (b.teamIds.length < a.teamIds.length ? b : a));
      lg.teamIds.push(id);
    }
  });
  c.leagues.sort((a, b) => a.level - b.level || (a.sub ?? 0) - (b.sub ?? 0));
}

/* ===== 加齢,引退,ドラフト,自由契約 ===== */

/** AI チームの選手が,シーズンごとに持っておく年数.それより古い年は 1 行にまとめる(セーブを軽くするため). */
export const AI_HISTORY = 4;

export function archiveSeason(c: Career, t: Team, level: number): void {
  for (const p of t.players) {
    if (p.stats.g > 0) {
      const attrs: Partial<Record<AttrKey, number>> = {};
      for (const k of keysOf(p)) attrs[k] = Math.round(p[k]);
      p.seasons.push({ season: c.season, level, team: t.name, age: p.age, stats: { ...p.stats }, attrs });
    }
    if (!t.user) foldHistory(p, AI_HISTORY);
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
  // 階層のすべてのチーム(並んでいるリーグも含めて)が指名できる人数
  const n = LEAGUES[level].teams * LEAGUES[level].count * DRAFT_ROUNDS + 4;
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

/**
 * 今シーズンの成績の弱い順.下の階層から上がってきたチームが先,同じ階層なら勝率の低い順(同じなら総合力の低い順).
 * ドラフトの指名順に使う.
 */
export function weakestFirst(c: Career, ids: number[]): number[] {
  const key = (id: number) => {
    const lg = c.leagues.find((l) => l.teamIds.includes(id));
    const s = lg?.stand[id];
    return { level: lg?.level ?? 0, pct: s && s.w + s.l ? s.w / (s.w + s.l) : 0.5, ovr: ovr(teamById(c, id)) };
  };
  const ks = new Map(ids.map((id) => [id, key(id)] as const));
  return [...ids].sort((a, b) => {
    const x = ks.get(a)!, y = ks.get(b)!;
    return x.level - y.level || x.pct - y.pct || x.ovr - y.ovr;
  });
}

/**
 * 指名順.1巡目(プレイヤーの階層では入札と抽選)と2巡目は,成績の弱いチームから(ウェーバー).
 * 3巡目があれば逆順,そのあとは交互.
 */
export function draftOrder(c: Career, ids: number[]): number[] {
  const asc = weakestFirst(c, ids);
  const out: number[] = [];
  for (let r = 0; r < DRAFT_ROUNDS; r++) out.push(...(r >= 2 && r % 2 === 0 ? [...asc].reverse() : asc));
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

export function takePick(c: Career, d: DraftState, t: Team, p: Player): void {
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
  return LEAGUES[level].base + (LEAGUES[level].teams + 1 - rank) * 1.2 + (c.trust - 50) * 0.08 + fanAppeal(c);
}

export const faDemand = (p: Player): number => playerValue(p) - 10 - (p.age >= 33 ? 4 : 0);

export function faVerdict(c: Career, p: Player): 'ok' | 'hard' {
  return faAppeal(c) >= faDemand(p) ? 'ok' : 'hard';
}

export function teamLevel(c: Career, t: Team): number {
  return leagueOfTeam(c, t.id).level;
}

/** 昔の 5 階層の形(1 階層に 1 リーグ,番号は 0〜4)のセーブか */
export const isLegacyShape = (c: Career): boolean =>
  c.leagues.length <= LEGACY_LEAGUES.length && c.leagues.every((lg, i) => lg.level === i && lg.sub === undefined);

/** 古いセーブのリーグに,地区を足す.昔の形なら昔の 5 階層の決まりで見る. */
export function addDivisions(c: Career): void {
  const defs = isLegacyShape(c) ? LEGACY_LEAGUES : LEAGUES;
  for (const lg of c.leagues) {
    if (defs[lg.level]?.divs && !lg.divs && lg.teamIds.length >= 6) lg.divs = balanceDivs(lg.teamIds, undefined, (id) => ovr(teamById(c, id)));
  }
}

/** 古いセーブ(v25 まで)に,あとから増えた上位のリーグを足す(AI チームだけで作る).昔の 5 階層の番号で作る. */
export function addMissingLeagues(c: Career): void {
  for (let level = c.leagues.length; level < LEGACY_LEAGUES.length; level++) {
    const L = LEGACY_LEAGUES[level];
    const names = shuffle(legacyNames(level)).slice(0, L.teams);
    const ts = names.map((nm) => genTeam(c, nm, L.base + ri(-4, 4), aiChem(level)));
    c.teams.push(...ts);
    const lg: LeagueState = { level, teamIds: ts.map((t) => t.id), schedule: [], stand: {}, week: 0, weeks: [], po: null, rankHist: {} };
    resetLeague(lg, L);
    c.leagues.push(lg);
    if (c.off) for (const t of ts) c.off.next[t.id] = level;
  }
  while (c.rec.titles.length < LEGACY_LEAGUES.length) c.rec.titles.push(0);
}

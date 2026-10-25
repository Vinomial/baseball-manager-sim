/** シーズン進行(週の進行,結果の確定,オフシーズン).世界全体の進行は world.ts. */
import { LEAGUES, MIN_FIELDERS, MIN_PITCHERS, rosterMax } from '../data/constants';
import { applyGameResultToStanding } from './result';
import { newGame, stepToEnd, userSide } from '../engine/game';
import { addChem } from '../growth/chemistry';
import { ageFactor, emptyStats, genPlayer, keysOf } from '../growth/player';
import { doTraining, type GrowthReport, type MenuKey } from '../growth/training';
import type { Career, DraftState, Difficulty, Game, GameKind, Review, Team, TeamRecords } from '../types';
import { boxScore } from '../engine/recap';
import { checkFA, checkGame, checkSeason, PRO_TITLES_FOR_HALL } from './achievements';
import { emptyPantry, tickMeal } from '../growth/meals';
import { emptyFac, emptyMarket, gateIncome, stepMarket, trainFacMult, weeklyIncome } from './economy';
import { tickConvert } from './convert';
import { confirmMessage } from './warnings';
import { DIFFS } from '../data/constants';
import { maybeInjure, setInjuryScale } from './health';
import { refillMissions, updateMissions, type GameCtx } from './missions';
import { cupSummary, playCupRound, startCup } from './cup';
import { CUP_START, PLAYOFF_START, TRAIN_PER_WEEK, WEEKS_PER_YEAR, weekInfo } from './calendar';
import { rollEvent } from './events';
import { addTrust, budgetFor, checkFired, payroll, renewContracts, revenueAfter, trustAfterGame, trustCondBias, trustGrowth, winProb } from './finance';
import { addLegend, computeAwards, pickRival, recordGame } from './awards';
import { clamp, pick, ri } from '../util/random';
import { leagueOfTeam, leagueTeams, standings, teamById } from './schedule';
import { autoLineup, autoPitchers, fielders, findPlayer, genTeam, ovr, pitchersOf, repairTeam, teamAttrs } from './team';
import {
  advanceDraft, ageTeam, aiRelease, aiSignFreeAgents, archiveSeason, buildWorld,
  computeNextLevels, draftOrder, genDraftClass, playPlayoffWeek, playoffText, pruneFreeAgents, resetLeague,
  runAiDraft, startPlayoffs, stepLeagues, toFreeAgent, trimRoster, userDraftPick, weeklyUpkeep,
} from './world';

export const SAVE_VERSION = 15;

export { teamById };
/** プレイヤーのチームの登録上限.オフの間は来シーズンのリーグで決まる. */
export const userRosterMax = (c: Career): number => rosterMax(c.off ? c.off.to : c.level);
export const userTeam = (c: Career): Team => teamById(c, c.userId);

export const newRecords = (): TeamRecords => ({
  streak: 0, bestStreak: 0, total: { w: 0, l: 0, d: 0 }, bestWins: 0, bestSeason: 0, titles: LEAGUES.map(() => 0), proStreak: 0,
});

/** 年の初めの記録(振り返りで,成長や資金の増減を出すため) */
export function snapshotYear(c: Career): void {
  const attrs: Record<number, number> = {};
  for (const p of userTeam(c).players) attrs[p.id] = keysOf(p).reduce((a, k) => a + p[k], 0);
  c.yearStart = { funds: c.funds, attrs };
}

export function newCareer(name: string, diff: Difficulty = 'normal'): Career {
  const c: Career = {
    version: SAVE_VERSION, nid: 1, tid: 1, season: 1, week: 0, cal: 0, cup: null, level: 0, phase: 'season',
    teams: [], leagues: [], userId: 0, last: null, off: null, hist: [], results: [], fa: [], champs: [],
    ach: {}, news: [], awards: [], legends: [], h2h: {}, rival: null, ended: false, event: null, trust: 60, revenue: 1, fired: null,
    funds: 3000, fac: emptyFac(), market: emptyMarket(), diff, auto: { lineup: false, rest: false }, yearStart: { funds: 3000, attrs: {} },
    missions: [], cups: [], cupBracket: [], lastMenus: [], pantry: emptyPantry(), meal: null, mid: 1,
    rec: newRecords(),
  };
  const u = genTeam(c, name, LEAGUES[0].base - 3, 5, true);
  // プレイヤーのチームは伸びしろを多めにする
  for (const p of u.players) for (const k of keysOf(p)) p.pot[k] = clamp(p.pot[k] + ri(5, 15), p[k], 99);
  c.userId = u.id;
  buildWorld(c, u);
  pickRival(c);
  refillMissions(c);
  recordHist(c);
  snapshotYear(c);
  return c;
}

/** 次のリーグ戦のプレイヤーの対戦カード(シーズンが終わっていれば null) */
export function userMatch(c: Career): { home: boolean; opp: Team; pair: [number, number]; cal: number } | null {
  const lg = c.leagues[c.level];
  if (lg.week >= lg.schedule.length) return null;
  const pair = lg.schedule[lg.week].find((x) => x.includes(c.userId));
  if (!pair) return null;
  const home = pair[0] === c.userId;
  return { home, opp: teamById(c, home ? pair[1] : pair[0]), pair, cal: lg.weeks[lg.week] };
}

/** 今のチーム能力を記録する(グラフ用) */
export function recordHist(c: Career): void {
  const u = userTeam(c);
  c.hist.push({ season: c.season, week: c.cal, level: c.level, ovr: ovr(u), attrs: teamAttrs(u) });
  if (c.hist.length > 480) c.hist.splice(0, c.hist.length - 480);
}

export function simGame(c: Career, home: Team, away: Team, logOn = false): Game {
  const g = newGame(home, away, logOn);
  stepToEnd(g);
  applyGameResultToStanding(c, g);
  return g;
}

export interface WeekResult {
  /** 実際に行った練習(おまかせ休養のときは変わる) */
  menu: MenuKey;
  /** プレイヤーが出た試合(プレーオフなどでは複数) */
  games: Game[];
  report: GrowthReport[];
  kind: GameKind | null;
}

/** 練習試合.本物の選手には影響させず,疲れと小さな経験だけを返す. */
function playPractice(c: Career): Game {
  const u = userTeam(c);
  const others = leagueTeams(c, c.level).filter((t) => !t.user);
  const opp = pick(others);
  const g = newGame(structuredClone(u), structuredClone(opp), true);
  stepToEnd(g);
  const us = userSide(g);
  for (const p of us.used) {
    const real = findPlayer(u, p.id);
    if (real) {
      real.fatigue = clamp(real.fatigue + (us.pcBy[p.id] ?? 0) * 0.6, 0, 100);
      if (maybeInjure(real, 0.003)) c.news.push(`${real.name}が練習試合で${real.inj!.name}をしました(${real.inj!.weeks}週間).`);
    }
  }
  for (const e of us.lineup) {
    const real = findPlayer(u, e.p.id);
    if (!real) continue;
    const k = pick(keysOf(real));
    if (real.pot[k] > real[k]) real[k] = Math.min(99, real[k] + 0.35 * ageFactor(real));
  }
  return g;
}

/** 練習をして,この週を進める.試合の操作はなく,結果だけが返る. */
export function playWeek(c: Career, menu: MenuKey, opt: { practice?: boolean } = {}): WeekResult {
  c.news = [];
  c.event = null;
  const info = weekInfo(c);
  const u = userTeam(c);
  const dk = DIFFS[c.diff];
  setInjuryScale(dk.injury);
  u.med = c.fac.clinic;
  // おまかせ進行:オーダーを組み直す,疲れがたまっていたら自動で休養にする
  if (c.auto.lineup) { autoLineup(u); autoPitchers(u); }
  if (c.auto.rest && menu !== 'rest' && confirmMessage(c, menu, !!opt.practice)) {
    menu = 'rest';
    opt = { ...opt, practice: false };
    c.news.push('疲れがたまっていたため,自動で休養にしました.');
  }
  const report = doTraining(u, menu, TRAIN_PER_WEEK * trustGrowth(c.trust) * info.trainMult * trainFacMult(c) * dk.growth, trustCondBias(c.trust), c.meal);

  let games: Game[] = [];
  let kind: GameKind | null = null;
  let userLeagueGame = false;
  if (c.cal === PLAYOFF_START || c.cal === PLAYOFF_START + 1) {
    games = playPlayoffWeek(c, c.cal === PLAYOFF_START ? 'semi' : 'final');
    if (games.length) kind = 'playoff';
  } else if (info.kind === 'cup') {
    games = playCupRound(c);
    if (games.length) kind = 'cup';
  } else if (info.userGame === 'league') {
    const m = userMatch(c)!;
    const g = simGame(c, teamById(c, m.pair[0]), teamById(c, m.pair[1]), true);
    games = [g];
    kind = 'league';
    userLeagueGame = true;
  } else if (opt.practice) {
    games = [playPractice(c)];
    kind = 'practice';
  }
  // 公式戦の後始末(信頼度,記録,ミッションなど)
  const ctx: GameCtx[] = [];
  for (const g of games) {
    if (kind === 'practice') break;
    ctx.push(afterOfficialGame(c, g, menu, kind!));
  }
  if (kind === 'practice') c.last = `練習試合: ${userSide(games[0]).runs} - ${(userSide(games[0]) === games[0].home ? games[0].away : games[0].home).runs}`;

  // 世界のほかの試合と,毎週の整理
  stepLeagues(c, userLeagueGame);
  c.week = c.leagues[c.level].week;
  tickConvert(c, menu);
  c.funds += weeklyIncome(c);
  stepMarket(c);
  weeklyUpkeep(c, menu === 'rest' ? 0.3 : menu === 'stam' ? 1.4 : 1);
  updateMissions(c, { menu, games: ctx });
  c.lastMenus.push(menu);
  if (c.lastMenus.length > 5) c.lastMenus.shift();
  tickMeal(c);
  c.cal++;
  recordHist(c);
  if (c.cal >= WEEKS_PER_YEAR) finishSeason(c);
  else {
    enterWeek(c);
    rollEvent(c);
  }
  return { games, report, kind, menu };
}

/** 新しい週に入るとき,プレーオフや全日本選手権の準備をする */
function enterWeek(c: Career): void {
  if (c.cal === PLAYOFF_START) { stepLeagues(c, false); startPlayoffs(c); }
  if (c.cal === CUP_START) startCup(c);
}

/** 公式戦 1 試合ぶんの後始末.ミッション用の情報を返す. */
function afterOfficialGame(c: Career, g: Game, menu: string, kind: GameKind): GameCtx {
  const us = userSide(g), them = us === g.home ? g.away : g.home, t = us.team;
  const opp = them.team;
  const prob = winProb(t, opp);
  for (const p of us.used) addChem(t, us.catcher.id, p.id, 4);
  addChem(t, us.sec.id, us.ss.id, 4);
  // 試合経験による小さな成長
  for (const e of us.lineup) {
    const k = pick(keysOf(e.p));
    if (e.p.pot[k] > e.p[k]) e.p[k] = Math.min(99, e.p[k] + 0.3 * ageFactor(e.p));
  }
  const win = us.runs > them.runs;
  const res = win ? '勝ち' : us.runs < them.runs ? '負け' : '引き分け';
  const tag = kind === 'league' ? `第${c.week + 1}戦` : kind === 'playoff' ? 'プレーオフ' : '全日本選手権';
  c.last = `${tag} vs ${opp.name}: ${us.runs} - ${them.runs} で${res}`;
  c.results.push({ season: c.season, week: c.week, opp: opp.name, us: us.runs, them: them.runs, home: us === g.home, prob, kind });
  addTrust(c, trustAfterGame(prob, us.runs, them.runs));
  checkFired(c, `${c.season}年目,チームの信頼を失い解任されました.`);
  recordGame(c, opp.id, us.runs, them.runs);
  const r = c.rec;
  if (win) { r.streak++; r.bestStreak = Math.max(r.bestStreak, r.streak); } else if (us.runs < them.runs) r.streak = 0;
  if (kind === 'league') {
    if (win) r.total.w++; else if (us.runs < them.runs) r.total.l++; else r.total.d++;
  }
  for (const p of g.injured) if (t.players.includes(p)) c.news.push(`${p.name}が試合中に${p.inj!.name}で${p.inj!.weeks}週間の離脱です.`);
  // 入場収入(ホームゲーム)
  if (us === g.home) c.funds += gateIncome(c, kind !== 'league');
  const box = boxScore(g, us);
  checkGame(c, g, opp.id, box.bat);
  void menu;
  return { win, us: us.runs, them: them.runs, prob, hr: box.bat.reduce((n, x) => n + x.hr, 0), k: box.pit.reduce((n, x) => n + x.k, 0) };
}

/** 1 年を締めて,昇格・降格,表彰,加齢,引退,ドラフトの準備を行う. */
export function finishSeason(c: Career): void {
  stepLeagues(c, false);
  const tbl = standings(c);
  const rank = tbl.findIndex((r) => r.t.id === c.userId) + 1;
  const rec = { ...c.leagues[c.level].stand[c.userId] };

  // プレーオフと全日本選手権の結果
  const champIds: Record<number, number> = {};
  for (const lg of c.leagues) if (lg.po?.champion != null) champIds[lg.level] = lg.po.champion;
  const playoff = playoffText(c, c.leagues[c.level]);
  const cup = cupSummary(c);
  if (cup.wins > 0) {
    addTrust(c, cup.wins * 1.5 + cup.giantKills * 3 + (cup.champion ? 8 : 0));
    c.pantry.meat += cup.wins;
    c.pantry.rice += cup.wins;
    if (cup.champion) c.revenue = Math.min(1.3, c.revenue + 0.1);
  }
  // 表彰(成績を記録に回す前に行う)
  c.awards.push(...computeAwards(c, champIds));
  if (c.awards.length > 500) c.awards.splice(0, c.awards.length - 500);

  const next = computeNextLevels(c);
  const from = c.level, to = next[c.userId];
  const move = (to > from ? 1 : to < from ? -1 : 0) as -1 | 0 | 1;

  // 成績の記録と加齢(年俸は加齢のあとに契約更改で見直す)
  const retired: string[] = [];
  for (const lg of c.leagues) {
    for (const t of leagueTeams(c, lg.level)) {
      archiveSeason(c, t, lg.level);
      const out = ageTeam(t);
      for (const p of out) addLegend(c, p, t);
      if (t.user) retired.push(...out.map((p) => p.name));
    }
  }
  for (const p of c.fa) p.age++;
  renewContracts(c);

  // 戦力外とドラフト.プレイヤーの来シーズンのリーグだけ,プレイヤーが参加する.
  for (const t of c.teams) if (!t.user) aiRelease(c, t);
  let draft: DraftState = { pool: [], order: [], idx: 0, picks: [], done: true };
  for (let level = 0; level < LEAGUES.length; level++) {
    const ids = c.teams.filter((t) => next[t.id] === level).map((t) => t.id);
    if (level === to) {
      draft = { pool: genDraftClass(c, level, c.fac.scout), order: draftOrder(c, ids), idx: 0, picks: [], done: false };
      advanceDraft(c, draft);
    } else {
      runAiDraft(c, level, ids);
    }
  }
  // 監督の信頼度.順位,昇降格,優勝で変わる
  const expRank = [...leagueTeams(c, from)].sort((a, b) => ovr(b) - ovr(a)).findIndex((t) => t.id === c.userId) + 1;
  addTrust(c, (expRank - rank) * 1.5 + (champIds[from] === c.userId ? 10 : 0) + (move > 0 ? 8 : move < 0 ? -12 : 0) + (rank <= 4 ? 2 : 0) - (rank === tbl.length ? 6 : 0));
  checkFired(c, `${c.season}年目の成績不振が続き,球団から解任されました.`);
  c.revenue = revenueAfter(rec.w / Math.max(1, rec.w + rec.l), rank <= 4, champIds[from] === c.userId, c.revenue);
  // チームの記録と実績
  const userTitle = champIds[from] === c.userId;
  if (userTitle) c.rec.titles[from]++;
  if (from === LEAGUES.length - 1) c.rec.proStreak = userTitle ? c.rec.proStreak + 1 : 0;
  if (rec.w > c.rec.bestWins) { c.rec.bestWins = rec.w; c.rec.bestSeason = c.season; }
  checkSeason(c, from, userTitle, rec.l === 0 && rec.d === 0 && rec.w > 0, to - from, { cupChamp: cup.champion, cupWins: cup.wins, giant: cup.giantKills });
  if (!c.ended && c.rec.titles[LEAGUES.length - 1] >= PRO_TITLES_FOR_HALL) {
    c.ended = true;
    c.news.push('プロリーグで5回優勝!あなたは殿堂入りしました.ゲームはこのまま続けられます.');
  }
  const review = makeReview(c, champIds[from], cup.champion);
  c.off = { rank, rec, move, from, to, next, retired, playoff, draft, signed: [], released: [], step: 0, cup: cup.text, review, press: [] };
  c.phase = 'off';
}

/** 1 年の振り返りをまとめる(成績を記録に回す前に呼ぶ) */
function makeReview(c: Career, champId: number | undefined, cupChampion: boolean): Review {
  const u = userTeam(c);
  const growers = u.players
    .map((p) => ({ name: p.name, delta: Math.round(keysOf(p).reduce((a, k) => a + p[k], 0) - (c.yearStart.attrs[p.id] ?? Infinity)) }))
    .filter((x) => Number.isFinite(x.delta) && x.delta > 0)
    .sort((a, b) => b.delta - a.delta).slice(0, 3);
  const aw = (kind: string) => c.awards.find((a) => a.season === c.season && a.level === c.level && a.kind === kind);
  const m = aw('MVP'), r = aw('新人王');
  return {
    champion: champId !== undefined ? teamById(c, champId).name : '',
    ownTitle: champId === c.userId,
    mvp: m ? { name: m.name, team: m.team, text: m.text } : null,
    rookie: r ? { name: r.name, team: r.team, text: r.text } : null,
    growers,
    fundsDelta: Math.round(c.funds - c.yearStart.funds),
    cupChampion,
  };
}

/** プレイヤーがドラフトで指名する.i が -1 なら見送り. */
export function pickDraft(c: Career, i: number): void {
  if (c.off) userDraftPick(c, c.off.draft, i);
}

/** 自由契約の選手を獲得する.できないときは理由を返す. */
export function signFreeAgent(c: Career, id: number): string | null {
  const u = userTeam(c), p = c.fa.find((x) => x.id === id);
  if (!p) return '選手が見つかりません.';
  if (payroll(u) + p.salary > budgetFor(c)) return '年俸の予算を超えてしまいます.';
  const max = userRosterMax(c);
  if (u.players.length >= max) return `登録は${max}人までです.先に放出してください.`;
  c.fa = c.fa.filter((x) => x !== p);
  delete p.prev;
  u.players.push(p);
  if (p.role === '投手') u.pitchers.push(p.id);
  c.off?.signed.push(p.name);
  checkFA(c);
  return null;
}

/** 放出する.できないときは理由を返す. */
export function releasePlayer(c: Career, id: number): string | null {
  const u = userTeam(c);
  const p = findPlayer(u, id);
  if (!p) return '選手が見つかりません.';
  if (p.role === '野手' && fielders(u).length <= MIN_FIELDERS) return `野手は${MIN_FIELDERS}人以上必要です.`;
  if (p.role === '投手' && pitchersOf(u).length <= MIN_PITCHERS) return `投手は${MIN_PITCHERS}人以上必要です.`;
  toFreeAgent(c, u, p);
  c.off?.released.push(p.name);
  if (u.lineup.length < 9 || u.lineup.some((e) => e.pid === id)) autoLineup(u);
  return null;
}

/** 予算を超えていても,放出できる控えがもういないときは,信頼度を落として始められる. */
export function overBudgetLocked(c: Career): boolean {
  const u = userTeam(c);
  if (payroll(u) <= budgetFor(c)) return false;
  const core = new Set<number>([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
  return u.players.some((p) => !core.has(p.id) && (p.role === '野手' ? fielders(u).length > MIN_FIELDERS : pitchersOf(u).length > MIN_PITCHERS));
}

export const canStartSeason = (c: Career): boolean =>
  c.phase === 'off' && !!c.off?.draft.done && userTeam(c).players.length <= userRosterMax(c) && !overBudgetLocked(c);

export function newSeason(c: Career): void {
  const o = c.off;
  if (!o) return;
  const u = userTeam(c);
  // 全チームの移動
  for (const lg of c.leagues) lg.teamIds = c.teams.filter((t) => o.next[t.id] === lg.level).map((t) => t.id);
  c.level = o.to;
  // 自由契約の市場と AI の補強
  aiSignFreeAgents(c, o.next);
  for (const t of c.teams) {
    for (const p of t.players) { p.stats = emptyStats(); p.fatigue = 0; }
    if (t.user) continue;
    trimRoster(c, t, rosterMax(o.next[t.id]));
    repairTeam(c, t, o.next[t.id]);
    autoLineup(t);
    autoPitchers(t);
    t.rotIdx = 0;
  }
  pruneFreeAgents(c);
  const notes = repairTeam(c, u, c.level);
  if (payroll(u) > budgetFor(c)) {
    addTrust(c, -8);
    c.news.push('年俸が予算を超えたまま開幕したため,球団の信頼を落としました.');
  }
  c.season++;
  c.week = 0;
  c.cal = 0;
  c.cup = null;
  pickRival(c);
  c.phase = 'season';
  c.off = null;
  c.results = [];
  u.rotIdx = 0;
  for (const lg of c.leagues) resetLeague(lg);
  recordHist(c);
  rollEvent(c);
  c.last = notes.length ? `入団テストで ${notes.join(',')} が加入しました.` : null;
}

export { genPlayer, pitchersOf, fielders, leagueOfTeam };

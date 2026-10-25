/** シーズン進行(週の進行,結果の確定,オフシーズン).世界全体の進行は world.ts. */
import { LEAGUES, MIN_FIELDERS, MIN_PITCHERS, rosterMax } from '../data/constants';
import { applyGameResultToStanding } from './result';
import { newGame, stepToEnd, userSide } from '../engine/game';
import { addChem } from '../growth/chemistry';
import { ageFactor, emptyStats, genPlayer, keysOf } from '../growth/player';
import { doTraining, type GrowthReport, type MenuKey } from '../growth/training';
import type { Career, DraftState, Game, Team, TeamRecords } from '../types';
import { boxScore } from '../engine/recap';
import { checkFA, checkGame, checkSeason, PRO_TITLES_FOR_HALL } from './achievements';
import { rollEvent } from './events';
import { addTrust, budgetFor, checkFired, payroll, renewContracts, revenueAfter, trustAfterGame, trustCondBias, trustGrowth, winProb } from './finance';
import { addLegend, computeAwards, pickRival, recordGame } from './awards';
import { clamp, pick, ri } from '../util/random';
import { leagueOfTeam, leagueTeams, standings, teamById } from './schedule';
import { autoLineup, autoPitchers, fielders, findPlayer, genTeam, ovr, pitchersOf, repairTeam, teamAttrs } from './team';
import {
  advanceDraft, advanceWorld, ageTeam, aiRelease, aiSignFreeAgents, archiveSeason, buildWorld, champRow,
  computeNextLevels, draftOrder, genDraftClass, playRound, playoffText, pruneFreeAgents, resetLeague,
  runAiDraft, runPlayoffs, toFreeAgent, trimRoster, userDraftPick,
} from './world';

export const SAVE_VERSION = 9;

export { teamById };
/** プレイヤーのチームの登録上限.オフの間は来シーズンのリーグで決まる. */
export const userRosterMax = (c: Career): number => rosterMax(c.off ? c.off.to : c.level);
export const userTeam = (c: Career): Team => teamById(c, c.userId);

export const newRecords = (): TeamRecords => ({
  streak: 0, bestStreak: 0, total: { w: 0, l: 0, d: 0 }, bestWins: 0, bestSeason: 0, titles: LEAGUES.map(() => 0), proStreak: 0,
});

export function newCareer(name: string): Career {
  const c: Career = {
    version: SAVE_VERSION, nid: 1, tid: 1, season: 1, week: 0, level: 0, phase: 'season',
    teams: [], leagues: [], userId: 0, last: null, off: null, hist: [], results: [], fa: [], champs: [],
    ach: {}, news: [], awards: [], legends: [], h2h: {}, rival: null, ended: false, event: null, trust: 60, revenue: 1, fired: null,
    rec: newRecords(),
  };
  const u = genTeam(c, name, LEAGUES[0].base - 3, 5, true);
  // プレイヤーのチームは伸びしろを多めにする
  for (const p of u.players) for (const k of keysOf(p)) p.pot[k] = clamp(p.pot[k] + ri(5, 15), p[k], 99);
  c.userId = u.id;
  buildWorld(c, u);
  pickRival(c);
  recordHist(c);
  return c;
}

/** 今週のプレイヤーの対戦カード */
export function userMatch(c: Career): { home: boolean; opp: Team; pair: [number, number] } {
  const lg = c.leagues[c.level];
  const pair = lg.schedule[lg.week].find((x) => x.includes(c.userId));
  if (!pair) throw new Error('今週の試合が見つかりません');
  const home = pair[0] === c.userId;
  return { home, opp: teamById(c, home ? pair[1] : pair[0]), pair };
}

/** 今のチーム能力を記録する(グラフ用) */
export function recordHist(c: Career): void {
  const u = userTeam(c);
  c.hist.push({ season: c.season, week: c.week, level: c.level, ovr: ovr(u), attrs: teamAttrs(u) });
  if (c.hist.length > 400) c.hist.splice(0, c.hist.length - 400);
}

export function simGame(c: Career, home: Team, away: Team, logOn = false): Game {
  const g = newGame(home, away, logOn);
  stepToEnd(g);
  applyGameResultToStanding(c, g);
  return g;
}

/** 練習をして今週の試合をすべて進める.試合の操作はなく,結果だけが返る. */
export function playWeek(c: Career, menu: MenuKey): { game: Game; report: GrowthReport[] } {
  c.news = [];
  c.event = null;
  const lg = c.leagues[c.level];
  // 試合数が多いリーグほど,1週あたりの練習は軽くなる(1シーズンの練習量はほぼ同じ)
  const report = doTraining(userTeam(c), menu, (10 / lg.schedule.length) * trustGrowth(c.trust), trustCondBias(c.trust));
  const { pair } = userMatch(c);
  const home = teamById(c, pair[0]), away = teamById(c, pair[1]);
  const prob = winProb(userTeam(c), home.user ? away : home);
  const game = simGame(c, home, away, true);
  afterUserGame(c, game, prob);
  return { game, report };
}

/** プレイヤーの試合後の処理を行い,他の試合を進めて次の週へ. */
function afterUserGame(c: Career, g: Game, prob: number): void {
  const us = userSide(g), them = us === g.home ? g.away : g.home, t = us.team;
  for (const p of us.used) addChem(t, us.catcher.id, p.id, 4);
  addChem(t, us.sec.id, us.ss.id, 4);
  // 試合経験による小さな成長
  for (const e of us.lineup) {
    const k = pick(keysOf(e.p));
    if (e.p.pot[k] > e.p[k]) e.p[k] = Math.min(99, e.p[k] + 0.3 * ageFactor(e.p));
  }
  const res = us.runs > them.runs ? '勝ち' : us.runs < them.runs ? '負け' : '引き分け';
  c.last = `第${c.week + 1}戦 vs ${them.team.name}: ${us.runs} - ${them.runs} で${res}`;
  c.results.push({ season: c.season, week: c.week, opp: them.team.name, us: us.runs, them: them.runs, home: us === g.home, prob });
  addTrust(c, trustAfterGame(prob, us.runs, them.runs));
  checkFired(c, `${c.season}年目の第${c.week + 1}戦のあと,チームの信頼を失い解任されました.`);
  recordGame(c, them.team.id, us.runs, them.runs);
  const r = c.rec;
  if (us.runs > them.runs) { r.total.w++; r.streak++; r.bestStreak = Math.max(r.bestStreak, r.streak); }
  else if (us.runs < them.runs) { r.total.l++; r.streak = 0; }
  else r.total.d++;
  checkGame(c, g, them.team.id, boxScore(g, us).bat);

  const lg = c.leagues[c.level];
  // 同じ週の他のカードと,各チームの疲労・調子・練習
  playRound(c, lg, true);
  c.week = lg.week;
  advanceWorld(c);
  recordHist(c);
  if (c.week >= lg.schedule.length) finishSeason(c);
  else rollEvent(c);
}

/** シーズンを締めて,プレーオフ,昇格・降格,加齢,引退,ドラフトの準備を行う. */
export function finishSeason(c: Career): void {
  advanceWorld(c);
  const tbl = standings(c);
  const rank = tbl.findIndex((r) => r.t.id === c.userId) + 1;
  const rec = { ...c.leagues[c.level].stand[c.userId] };

  // プレーオフ
  let playoff = '';
  const champIds: Record<number, number> = {};
  for (const lg of c.leagues) {
    const r = runPlayoffs(c, lg.level);
    c.champs.push(champRow(c, lg.level, r));
    champIds[lg.level] = r.champion.id;
    if (lg.level === c.level) playoff = playoffText(c, lg.level, r);
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
      draft = { pool: genDraftClass(c, level), order: draftOrder(c, ids), idx: 0, picks: [], done: false };
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
  checkSeason(c, from, userTitle, rec.l === 0 && rec.d === 0 && rec.w > 0, to - from);
  if (!c.ended && c.rec.titles[LEAGUES.length - 1] >= PRO_TITLES_FOR_HALL) {
    c.ended = true;
    c.news.push('プロリーグで5回優勝!あなたは殿堂入りしました.ゲームはこのまま続けられます.');
  }
  c.off = { rank, rec, move, from, to, next, retired, playoff, draft, signed: [], released: [], step: 0 };
  c.phase = 'off';
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

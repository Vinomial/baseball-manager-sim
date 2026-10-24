/** シーズン進行(週の開始,結果の確定,オフシーズン,ドラフト). */
import { LEAGUES, MIN_FIELDERS, MIN_PITCHERS, ROSTER_MAX, TEAM_NAMES } from '../data/constants';
import { applyGameResultToStanding } from './result';
import { newGame, step, finish, userSide } from '../engine/game';
import { addChem } from '../growth/chemistry';
import { agePlayer, ageFactor, condDrift, emptyStats, genPlayer, keysOf } from '../growth/player';
import { doTraining, type GrowthReport, type MenuKey } from '../growth/training';
import type { Career, Game, Player, Team } from '../types';
import { clamp, pick, ri, shuffle } from '../util/random';
import { emptyStanding, makeSchedule, standings } from './schedule';
import { autoLineup, fielders, findPlayer, genTeam, pitchersOf, repairTeam } from './team';

export const SAVE_VERSION = 1;

export const teamById = (c: Career, id: number): Team => {
  const t = c.teams.find((x) => x.id === id);
  if (!t) throw new Error(`team ${id} not found`);
  return t;
};
export const userTeam = (c: Career): Team => teamById(c, c.userId);

/** AI チームの連携の初期値はリーグが上がるほど高い */
const aiChem = (level: number): number => 20 + level * 12;

export function newCareer(name: string): Career {
  const c: Career = {
    version: SAVE_VERSION, nid: 1, tid: 1, season: 1, week: 0, level: 0, phase: 'season',
    teams: [], schedule: [], stand: {}, userId: 0, last: null, off: null,
  };
  const u = genTeam(c, name, LEAGUES[0].base - 3, 5, true);
  // プレイヤーのチームは伸びしろを多めにする
  for (const p of u.players) for (const k of keysOf(p)) p.pot[k] = clamp(p.pot[k] + ri(5, 15), p[k], 99);
  c.userId = u.id;
  c.teams = [u];
  buildLeague(c);
  return c;
}

/** 現在のリーグの相手チームと日程を作り直す */
export function buildLeague(c: Career): void {
  const u = userTeam(c);
  const base = LEAGUES[c.level].base;
  const names = shuffle(TEAM_NAMES[c.level]).filter((n) => n !== u.name).slice(0, 5);
  c.teams = [u, ...names.map((n) => genTeam(c, n, base, aiChem(c.level)))];
  c.schedule = makeSchedule(shuffle(c.teams.map((t) => t.id)));
  c.stand = {};
  for (const t of c.teams) c.stand[t.id] = emptyStanding();
}

/** 今週のプレイヤーの対戦カード */
export function userMatch(c: Career): { home: boolean; opp: Team; pair: [number, number] } {
  const pair = c.schedule[c.week].find((x) => x.includes(c.userId));
  if (!pair) throw new Error('今週の試合が見つかりません');
  const home = pair[0] === c.userId;
  return { home, opp: teamById(c, home ? pair[1] : pair[0]), pair };
}

/** 練習を行い,今週の試合を作る */
export function startWeek(c: Career, menu: MenuKey): { game: Game; report: GrowthReport[] } {
  const report = doTraining(userTeam(c), menu);
  const { pair } = userMatch(c);
  return { game: newGame(teamById(c, pair[0]), teamById(c, pair[1]), true), report };
}

export function simGame(c: Career, home: Team, away: Team): Game {
  const g = newGame(home, away, false);
  let n = 0;
  while (!g.over && n++ < 400) step(g);
  if (!g.over) finish(g);
  applyGameResultToStanding(c, g);
  return g;
}

/** プレイヤーの試合結果を確定し,他の試合を進めて次の週へ */
export function finalizeWeek(c: Career, g: Game): void {
  applyGameResultToStanding(c, g);
  const us = userSide(g), them = us === g.home ? g.away : g.home, t = us.team;
  for (const p of us.used) addChem(t, us.catcher.id, p.id, 4);
  addChem(t, us.sec.id, us.ss.id, 4);
  // 試合経験による小さな成長
  for (const e of us.lineup) {
    const k = pick(keysOf(e.p));
    if (e.p.pot[k] > e.p[k]) e.p[k] = Math.min(99, e.p[k] + 0.3 * ageFactor(e.p));
  }
  const res = us.runs > them.runs ? '勝ち' : us.runs < them.runs ? '負け' : '引き分け';
  c.last = `第${c.week + 1}週 vs ${them.team.name}: ${us.runs} - ${them.runs} で${res}`;

  for (const [h, a] of c.schedule[c.week]) {
    if (h === c.userId || a === c.userId) continue;
    simGame(c, teamById(c, h), teamById(c, a));
  }
  for (const tm of c.teams) {
    for (const p of tm.players) {
      p.fatigue = Math.max(0, p.fatigue - 45);
      if (!tm.user) condDrift(p, 0);
    }
  }
  c.week++;
  if (c.week >= c.schedule.length) finishSeason(c);
}

export function finishSeason(c: Career): void {
  const tbl = standings(c);
  const rank = tbl.findIndex((r) => r.t.id === c.userId) + 1;
  let move: -1 | 0 | 1 = 0;
  if (rank <= 2 && c.level < LEAGUES.length - 1) move = 1;
  else if (rank === c.teams.length && c.level > 0) move = -1;
  const from = c.level;
  const u = userTeam(c);
  const retired: string[] = [];
  for (const p of [...u.players]) {
    if (agePlayer(p)) {
      retired.push(p.name);
      u.players = u.players.filter((x) => x !== p);
    }
  }
  c.level += move;
  c.off = { rank, rec: { ...c.stand[c.userId] }, move, from, retired, draft: genDraft(c), drafted: null };
  c.phase = 'off';
}

export function genDraft(c: Career): Player[] {
  const base = LEAGUES[c.level].base - 6;
  return (['野手', '野手', '投手'] as const).map((r) => {
    const p = genPlayer(c, r, base, { age: ri(18, 22), potMul: 1.3 });
    p.scout = {};
    for (const k of keysOf(p)) {
      const e = ri(4, 10);
      p.scout[k] = [clamp(Math.round(p[k] - ri(0, e)), 1, 99), clamp(Math.round(p[k] + ri(0, e)), 1, 99)];
    }
    return p;
  });
}

/** ドラフトで指名する.i が -1 なら見送り. */
export function pickDraft(c: Career, i: number): void {
  if (!c.off || c.off.drafted) return;
  const u = userTeam(c);
  if (i < 0) { c.off.drafted = '-'; return; }
  const p = c.off.draft[i];
  delete p.scout;
  u.players.push(p);
  if (p.role === '投手') u.pitchers.push(p.id);
  c.off.drafted = p.name;
}

/** 放出する.できないときは理由を返す. */
export function releasePlayer(c: Career, id: number): string | null {
  const u = userTeam(c);
  const p = findPlayer(u, id);
  if (!p) return '選手が見つかりません.';
  if (p.role === '野手' && fielders(u).length <= MIN_FIELDERS) return `野手は${MIN_FIELDERS}人以上必要です.`;
  if (p.role === '投手' && pitchersOf(u).length <= MIN_PITCHERS) return `投手は${MIN_PITCHERS}人以上必要です.`;
  u.players = u.players.filter((x) => x.id !== id);
  u.pitchers = u.pitchers.filter((x) => x !== id);
  if (u.lineup.some((e) => e.pid === id)) autoLineup(u);
  return null;
}

export const canStartSeason = (c: Career): boolean =>
  c.phase === 'off' && !!c.off?.drafted && userTeam(c).players.length <= ROSTER_MAX;

export function newSeason(c: Career): void {
  const u = userTeam(c);
  for (const p of u.players) { p.stats = emptyStats(); p.fatigue = 0; }
  const notes = repairTeam(c, u, c.level);
  c.season++;
  c.week = 0;
  c.phase = 'season';
  c.off = null;
  u.rotIdx = 0;
  buildLeague(c);
  c.last = notes.length ? `入団テストで ${notes.join(',')} が加入しました.` : null;
}

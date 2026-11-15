/** 年末の選手権.アマチュア・日本・世界の 3 つの大会を,週ごとに 1 回戦ずつ進める. */
import type { Career, CupLive, CupMatch, Game, Team } from '../types';
import { CUPS, roundName, type CupDef } from '../data/cups';
import { leaguesInTier, standings, teamById } from './schedule';
import { playSeriesGen, runAuto, type MomentGen } from './world';

/** 標準の対戦表の並び(シード 1 が最後に当たる位置に置く) */
function bracketOrder(n: number): number[] {
  let o = [1];
  while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap((x) => [x, m - x]); }
  return o;
}

/** シードは上の階層,そのリーグの順位の順.上位のシードは 1 回戦が免除される. */
function newCup(c: Career, d: CupDef): CupLive {
  const seeds: Team[] = [];
  for (const l of [...d.tiers].sort((a, b) => b - a)) {
    // 同じ階層のリーグは,順位ごとに交互に並べる(東の 1 位,西の 1 位,東の 2 位…)
    const tables = leaguesInTier(c, l).map((lg) => standings(c, lg).map((r) => r.t));
    const n = Math.max(0, ...tables.map((t) => t.length));
    for (let i = 0; i < n; i++) for (const t of tables) if (t[i]) seeds.push(t[i]);
  }
  let size = 2;
  while (size < seeds.length) size *= 2;
  return { kind: d.kind, slots: bracketOrder(size).map((s) => seeds[s - 1]?.id ?? null), round: 0, done: false };
}

/** 選手権を始める.プレイヤーの出る大会は c.cup,ほかは c.sideCups. */
export function startCup(c: Career): void {
  c.cup = null;
  c.cupBracket = [];
  c.sideCups = [];
  for (const d of CUPS) {
    if (!d.tiers.some((t) => leaguesInTier(c, t).length)) continue;
    const live = newCup(c, d);
    if (d.tiers.includes(c.level)) c.cup = live;
    else c.sideCups.push({ live, bracket: [] });
  }
}

const levelOf = (c: Career, id: number): number => c.leagues.find((lg) => lg.teamIds.includes(id))!.level;

/** 1 つの大会の 1 回戦を進める.ログ付きの試合(プレイヤーの試合)を返す. */
function* playRound(c: Career, cup: CupLive, bracket: CupMatch[]): MomentGen<Game[]> {
  if (cup.done) return [];
  const round = roundName(cup.slots.length, cup.round);
  const next: (number | null)[] = [];
  const mine: Game[] = [];
  for (let i = 0; i < cup.slots.length; i += 2) {
    const a = cup.slots[i], b = cup.slots[i + 1];
    if (a === null || b === null) { next.push(a ?? b); continue; }
    const ta = teamById(c, a), tb = teamById(c, b);
    const r = yield* playSeriesGen(c, ta, tb, 1);
    const g = r.last;
    const sa = g.home.team.id === a ? g.home.runs : g.away.runs, sb = g.home.team.id === b ? g.home.runs : g.away.runs;
    bracket.push({ round, a: ta.name, b: tb.name, aId: a, bId: b, sa, sb, winner: r.winner.id });
    next.push(r.winner.id);
    mine.push(...r.games);
  }
  cup.slots = next;
  cup.round++;
  if (next.length === 1) {
    cup.done = true;
    const final = bracket[bracket.length - 1];
    const champ = teamById(c, next[0]!);
    const ru = final ? (final.aId === champ.id ? final.bId : final.aId) : champ.id;
    c.cups.push({ season: c.season, kind: cup.kind, champion: champ.name, championId: champ.id, championLevel: levelOf(c, champ.id), runnerUp: teamById(c, ru).name });
    if (c.cups.length > 90) c.cups.shift();
  }
  return mine;
}

/** 今週の 1 回戦を,すべての大会で進める.プレイヤーの試合(実況付き)を返す. */
export const playCupRound = (c: Career): Game[] => runAuto(playCupRoundGen(c));

/** playCupRound の,勝負どころで止まる版 */
export function* playCupRoundGen(c: Career): MomentGen<Game[]> {
  for (const s of c.sideCups ?? []) yield* playRound(c, s.live, s.bracket);
  return c.cup ? yield* playRound(c, c.cup, c.cupBracket) : [];
}

export interface CupSummary { champion: boolean; wins: number; giantKills: number; text: string; }

/** プレイヤーの全日本選手権の結果 */
export function cupSummary(c: Career): CupSummary {
  const mine = c.cupBracket.filter((m) => m.aId === c.userId || m.bId === c.userId);
  if (!mine.length) return { champion: false, wins: 0, giantKills: 0, text: '出場なし' };
  const myLevel = levelOf(c, c.userId);
  let wins = 0, giant = 0;
  for (const m of mine) {
    if (m.winner === c.userId) { wins++; if (levelOf(c, m.aId === c.userId ? m.bId : m.aId) > myLevel) giant++; }
  }
  const last = mine[mine.length - 1];
  const champion = last.round === '決勝' && last.winner === c.userId;
  return { champion, wins, giantKills: giant, text: champion ? '優勝!' : `${last.round}で敗退` };
}

export type { CupMatch };

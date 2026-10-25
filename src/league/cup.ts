/** 年末の全日本選手権.全リーグの全チームが 1 つのトーナメントで,週ごとに 1 回戦ずつ戦う. */
import { LEAGUES } from '../data/constants';
import type { Career, CupMatch, Game, Team } from '../types';
import { cupRoundName } from './calendar';
import { standings, teamById } from './schedule';
import { playSeries } from './world';

/** 標準の対戦表の並び(シード 1 が最後に当たる位置に置く) */
function bracketOrder(n: number): number[] {
  let o = [1];
  while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap((x) => [x, m - x]); }
  return o;
}

/** シードは上のリーグ,そのリーグの順位の順.上位のシードは 1 回戦が免除される. */
export function startCup(c: Career): void {
  const seeds: Team[] = [];
  for (let l = LEAGUES.length - 1; l >= 0; l--) seeds.push(...standings(c, l).map((r) => r.t));
  c.cup = { slots: bracketOrder(32).map((s) => seeds[s - 1]?.id ?? null), round: 0, done: false };
  c.cupBracket = [];
}

const levelOf = (c: Career, id: number): number => c.leagues.find((lg) => lg.teamIds.includes(id))!.level;

/** 今週の 1 回戦を全試合進める.プレイヤーの試合(実況付き)を返す. */
export function playCupRound(c: Career): Game[] {
  const cup = c.cup;
  if (!cup || cup.done) return [];
  const round = cupRoundName(cup.round);
  const next: (number | null)[] = [];
  const mine: Game[] = [];
  for (let i = 0; i < cup.slots.length; i += 2) {
    const a = cup.slots[i], b = cup.slots[i + 1];
    if (a === null || b === null) { next.push(a ?? b); continue; }
    const ta = teamById(c, a), tb = teamById(c, b);
    const r = playSeries(c, ta, tb, 1);
    const g = r.last;
    const sa = g.home.team.id === a ? g.home.runs : g.away.runs, sb = g.home.team.id === b ? g.home.runs : g.away.runs;
    c.cupBracket.push({ round, a: ta.name, b: tb.name, aId: a, bId: b, sa, sb, winner: r.winner.id });
    next.push(r.winner.id);
    mine.push(...r.games);
  }
  cup.slots = next;
  cup.round++;
  if (next.length === 1) {
    cup.done = true;
    const final = c.cupBracket[c.cupBracket.length - 1];
    const champ = teamById(c, next[0]!);
    const ru = final.aId === champ.id ? final.bId : final.aId;
    c.cups.push({ season: c.season, champion: champ.name, championId: champ.id, championLevel: levelOf(c, champ.id), runnerUp: teamById(c, ru).name });
    if (c.cups.length > 60) c.cups.shift();
  }
  return mine;
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

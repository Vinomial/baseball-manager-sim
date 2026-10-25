/** 年末の全日本選手権.全リーグの全チームが 1 つのトーナメントで戦う. */
import { LEAGUES } from '../data/constants';
import { newGame, stepToEnd } from '../engine/game';
import type { Career, CupMatch, CupRow, Team } from '../types';
import { pick } from '../util/random';
import { standings } from './schedule';

const ROUND_NAMES: Record<number, string> = { 2: '決勝', 4: '準決勝', 8: '準々決勝', 16: '2回戦', 32: '1回戦' };

/** 1 試合.成績には入れない. */
function play(a: Team, b: Team): { sa: number; sb: number; winner: Team } {
  for (const t of [a, b]) for (const p of t.players) p.fatigue = 0;
  const g = newGame(a, b, false);
  stepToEnd(g);
  for (const t of [a, b]) for (const p of t.players) if (g.snap[p.id]) p.stats = { ...g.snap[p.id] };
  const sa = g.home.runs, sb = g.away.runs;
  return { sa, sb, winner: sa !== sb ? (sa > sb ? a : b) : pick([a, b]) };
}

/** 標準の対戦表の並び(シード 1 が最後に当たる位置に置く) */
function bracketOrder(n: number): number[] {
  let o = [1];
  while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap((x) => [x, m - x]); }
  return o;
}

export interface CupResult { matches: CupMatch[]; champion: Team; runnerUp: Team; userRound: string; userWins: number; giantKills: number; }

/** シードは上のリーグ,そのリーグの順位の順.上位のシードは 1 回戦が免除される. */
export function runCup(c: Career): CupResult {
  const seeds: Team[] = [];
  for (let l = LEAGUES.length - 1; l >= 0; l--) seeds.push(...standings(c, l).map((r) => r.t));
  const size = 32;
  const slot = bracketOrder(size).map((s) => seeds[s - 1] ?? null);
  const matches: CupMatch[] = [];
  let cur: (Team | null)[] = slot;
  let userWins = 0, giantKills = 0, userRound = '1回戦から出場';
  const level = (t: Team) => c.leagues.find((lg) => lg.teamIds.includes(t.id))!.level;
  let userOut = false;
  while (cur.length > 1) {
    const round = ROUND_NAMES[cur.length] ?? `${cur.length}強`;
    const next: (Team | null)[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const a = cur[i], b = cur[i + 1];
      if (!a || !b) { next.push(a ?? b); continue; }
      const r = play(a, b);
      matches.push({ round, a: a.name, b: b.name, aId: a.id, bId: b.id, sa: r.sa, sb: r.sb, winner: r.winner.id });
      next.push(r.winner);
      if ((a.user || b.user) && !userOut) {
        if (r.winner.user) {
          userWins++;
          const other = a.user ? b : a;
          if (level(other) > level(c.teams.find((t) => t.user)!)) giantKills++;
        } else { userOut = true; userRound = `${round}で敗退`; }
      }
    }
    cur = next;
  }
  const champion = cur[0]!;
  const final = matches[matches.length - 1];
  const runnerUp = c.teams.find((t) => t.id === (final.aId === champion.id ? final.bId : final.aId))!;
  if (champion.user) userRound = '優勝!';
  return { matches, champion, runnerUp, userRound, userWins, giantKills };
}

export function cupRow(c: Career, r: CupResult): CupRow {
  return { season: c.season, champion: r.champion.name, championId: r.champion.id, championLevel: c.leagues.find((lg) => lg.teamIds.includes(r.champion.id))!.level, runnerUp: r.runnerUp.name };
}

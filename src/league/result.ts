import type { Career, Game } from '../types';
import { clamp } from '../util/random';
import { leagueOfTeam } from './schedule';

/** 試合の疲労・出場・先発のローテーションだけを反映する(順位には入れない試合にも使う) */
export function applyGameEffects(g: Game): void {
  const H = g.home, A = g.away;
  for (const s of [H, A]) {
    for (const p of s.used) {
      p.fatigue = clamp(p.fatigue + (s.pcBy[p.id] ?? 0) * 0.75, 0, 100);
      p.stats.g++;
    }
    for (const e of s.lineup) e.p.stats.g++;
    s.team.rotIdx++;
  }
  if (H.runs > A.runs) { H.starter.stats.w++; A.starter.stats.l++; }
  else if (A.runs > H.runs) { A.starter.stats.w++; H.starter.stats.l++; }
}

/** リーグ戦の結果を,順位・投手成績・疲労に反映する */
export function applyGameResultToStanding(c: Career, g: Game): void {
  applyGameEffects(g);
  const H = g.home, A = g.away;
  const lg = leagueOfTeam(c, H.team.id);
  const sh = lg.stand[H.team.id], sa = lg.stand[A.team.id];
  sh.rf += H.runs; sh.ra += A.runs;
  sa.rf += A.runs; sa.ra += H.runs;
  if (H.runs > A.runs) { sh.w++; sa.l++; }
  else if (A.runs > H.runs) { sa.w++; sh.l++; }
  else { sh.d++; sa.d++; }
}

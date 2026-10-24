import type { Career, Game } from '../types';
import { clamp } from '../util/random';

/** 試合結果を順位表・投手成績・疲労に反映する */
export function applyGameResultToStanding(c: Career, g: Game): void {
  const H = g.home, A = g.away;
  for (const s of [H, A]) {
    for (const p of s.used) {
      p.fatigue = clamp(p.fatigue + (s.pcBy[p.id] ?? 0) * 0.75, 0, 100);
      p.stats.g++;
    }
    for (const e of s.lineup) e.p.stats.g++;
    s.team.rotIdx++;
  }
  const sh = c.stand[H.team.id], sa = c.stand[A.team.id];
  sh.rf += H.runs; sh.ra += A.runs;
  sa.rf += A.runs; sa.ra += H.runs;
  if (H.runs > A.runs) { sh.w++; sa.l++; H.starter.stats.w++; A.starter.stats.l++; }
  else if (A.runs > H.runs) { sa.w++; sh.l++; A.starter.stats.w++; H.starter.stats.l++; }
  else { sh.d++; sa.d++; }
}

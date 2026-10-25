/** 戦力外のおすすめ.来季に向けて,放出したほうがよい選手を示す. */
import { MIN_FIELDERS, MIN_PITCHERS } from '../data/constants';
import { futureValue } from '../growth/player';
import type { Career, Player } from '../types';
import { budgetFor, fmtYen, payroll } from './finance';
import { fielders, pitchersOf } from './team';
import { userRosterMax } from './season';

export interface CutAdvice {
  p: Player;
  score: number;
  reason: string;
  /** おすすめ(来季に向けて放出したほうがよい) */
  rec: boolean;
  /** 放出できない場合の理由 */
  locked: string | null;
}

/** 控えの選手を,放出したい順に並べる.先発や先発ローテーションの選手は含めない. */
export function adviseCuts(c: Career): CutAdvice[] {
  const u = c.teams.find((t) => t.user)!;
  const core = new Set<number>([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
  const bench = u.players.filter((p) => !core.has(p.id));
  if (!bench.length) return [];
  const fv = bench.map(futureValue).sort((a, b) => a - b);
  const median = fv[Math.floor(fv.length / 2)];
  const over = Math.max(0, u.players.length - userRosterMax(c));
  let overBudget = Math.max(0, payroll(u) - budgetFor(c));
  const rows: CutAdvice[] = bench.map((p) => {
    const old = Math.max(0, p.age - 29);
    const weak = Math.max(0, median - futureValue(p));
    const score = old * 1.0 + weak * 0.25 + (overBudget > 0 ? p.salary / 200 : 0);
    let reason: string;
    if (old >= 3 && weak > 2) reason = `${p.age}歳で控え.力も下がっていく見込みです.`;
    else if (old >= 3) reason = `${p.age}歳.来季はさらに衰えが見込まれます.`;
    else if (weak > 6) reason = '控えの中でも将来性が低めです.';
    else if (overBudget > 0 && p.salary >= 400) reason = `年俸${fmtYen(p.salary)}が予算を圧迫しています.`;
    else reason = '放出の優先度は低めです.';
    const locked = p.role === '野手' && fielders(u).length <= MIN_FIELDERS ? `野手は${MIN_FIELDERS}人以上必要です.`
      : p.role === '投手' && pitchersOf(u).length <= MIN_PITCHERS ? `投手は${MIN_PITCHERS}人以上必要です.` : null;
    return { p, score, reason, rec: false, locked };
  }).sort((a, b) => b.score - a.score);
  // 登録上限を超えている分は必ずおすすめ.そうでなければ,点数が高いものだけ.
  rows.forEach((r, i) => {
    const needBudget = overBudget > 0 && !r.locked;
    r.rec = !r.locked && (i < over || r.score >= 4 || needBudget);
    if (needBudget) overBudget -= r.p.salary;
    if (i < over && !r.locked) r.reason = `登録上限を${over}人超えています.${r.reason}`;
  });
  return rows;
}

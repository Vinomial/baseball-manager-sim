/** 個人成績のランキングと通算成績.DOM に依存しない. */
import { emptyStats } from '../growth/player';
import type { Career, Player, Stats } from '../types';
import { leagueTeams } from './schedule';

export interface LeaderRow { p: Player; team: string; value: number; text: string; }
export interface Board { key: string; name: string; rows: LeaderRow[]; }

const avg = (s: Stats) => (s.ab ? s.h / s.ab : 0);
const era = (s: Stats) => (s.outs ? (s.r * 27) / s.outs : 99);
/** 出塁率+長打率.二塁打・三塁打を数えていない古い記録は,単打として数える. */
export function opsOf(s: Stats): number {
  const obp = s.ab + s.bb ? (s.h + s.bb) / (s.ab + s.bb) : 0;
  const slg = s.ab ? (s.h + (s.d2 ?? 0) + 2 * (s.t3 ?? 0) + 3 * s.hr) / s.ab : 0;
  return obp + slg;
}
/** 1 イニングあたりに出した走者の数 */
export const whipOf = (s: Stats): number => (s.outs ? ((s.ha + s.bba) * 3) / s.outs : 99);
export const fmt3 = (v: number): string => (v >= 1 ? '1.000' : '.' + String(Math.round(v * 1000)).padStart(3, '0'));

/** 今シーズンの個人成績ランキング.規定に満たない選手は打率・防御率から除く. */
export function leaders(c: Career, level: number, n = 5): Board[] {
  const lg = c.leagues[level];
  const games = lg.week;
  const rows: { p: Player; team: string }[] = [];
  for (const t of leagueTeams(c, level)) for (const p of t.players) rows.push({ p, team: t.name });
  const bats = rows.filter((r) => r.p.role === '野手'), pits = rows.filter((r) => r.p.role === '投手');
  const top = (list: { p: Player; team: string }[], f: (s: Stats) => number, text: (v: number) => string, asc = false, ok: (s: Stats) => boolean = () => true): LeaderRow[] =>
    list.filter((r) => ok(r.p.stats))
      .map((r) => ({ ...r, value: f(r.p.stats), text: '' }))
      .sort((a, b) => (asc ? a.value - b.value : b.value - a.value) || b.p.stats.g - a.p.stats.g)
      .filter((r) => asc || r.value > 0)
      .slice(0, n)
      .map((r) => ({ ...r, text: text(r.value) }));
  const qualBat = (s: Stats) => s.pa >= games * 2.2;
  const qualPit = (s: Stats) => s.outs >= games * 2;
  return [
    { key: 'avg', name: '打率', rows: top(bats, avg, fmt3, false, qualBat) },
    { key: 'ops', name: 'OPS', rows: top(bats, opsOf, (v) => v.toFixed(3), false, qualBat) },
    { key: 'hr', name: '本塁打', rows: top(bats, (s) => s.hr, (v) => `${v}本`) },
    { key: 'rbi', name: '打点', rows: top(bats, (s) => s.rbi, (v) => `${v}点`) },
    { key: 'sb', name: '盗塁', rows: top(bats, (s) => s.sb, (v) => `${v}個`) },
    { key: 'w', name: '勝利', rows: top(pits, (s) => s.w, (v) => `${v}勝`) },
    { key: 'era', name: '防御率', rows: top(pits, era, (v) => v.toFixed(2), true, qualPit) },
    { key: 'whip', name: 'WHIP', rows: top(pits, whipOf, (v) => v.toFixed(2), true, qualPit) },
    { key: 'k', name: '奪三振', rows: top(pits, (s) => s.k, (v) => `${v}個`) },
  ];
}

export function sumStats(list: Stats[]): Stats {
  const t = emptyStats();
  for (const s of list) for (const k of Object.keys(t) as (keyof Stats)[]) t[k] += s[k] ?? 0;
  return t;
}

/** 通算成績(過去のシーズン+今シーズン). */
export function careerStats(p: Player, includeCurrent: boolean): Stats {
  return sumStats([...p.seasons.map((x) => x.stats), ...(includeCurrent ? [p.stats] : [])]);
}

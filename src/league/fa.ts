/**
 * 大物の自由契約選手の争奪.階層の水準より明らかに上の選手には,他球団もオファーを出す.
 * 年俸を上乗せするほど勝ちやすいが,負けると他球団と契約してしまう.DOM に依存しない.
 */
import { LEAGUES, MIN_FIELDERS } from '../data/constants';
import { playerValue } from '../growth/player';
import type { Career, Player, Team } from '../types';
import { clamp, pick, rand } from '../util/random';
import { budgetFor } from './finance';
import { projectedPayroll } from './contracts';
import { autoLineup, autoPitchers } from './team';
import { faAppeal, faDemand } from './world';

/** オファーの上乗せ(年俸の倍率) */
export const OFFERS = [1, 1.25, 1.5];

/** 来季の階層(オフならドラフト後の行き先) */
const tierOf = (c: Career): number => (c.off ? c.off.to : c.level);

/** 他球団も狙う大物か */
export const isStarFA = (c: Career, p: Player): boolean => playerValue(p) >= LEAGUES[tierOf(c)].base + 6;

/** 争奪に加わる他球団の数(大物ほど多い) */
export const rivalsFor = (c: Career, p: Player): number => clamp(Math.round((playerValue(p) - LEAGUES[tierOf(c)].base) / 4), 1, 5);

/** 上乗せ mult のオファーで,獲得できる確率 */
export function faChance(c: Career, p: Player, mult: number): number {
  return clamp(0.4 + (faAppeal(c) - faDemand(p)) * 0.05 + (mult - 1) * 1.2 - rivalsFor(c, p) * 0.06, 0.03, 0.95);
}

/** 他球団(来季の階層のうち,登録に空きがあるチーム)に,選手を入れる */
function signElsewhere(c: Career, p: Player): Team | null {
  const tier = tierOf(c);
  const ts = c.teams.filter((t) => !t.user && (c.off ? c.off.next[t.id] === tier : c.leagues.some((lg) => lg.level === tier && lg.teamIds.includes(t.id))));
  const room = ts.filter((t) => t.players.length < LEAGUES[tier].roster);
  const t = room.length ? pick(room) : ts.length ? pick(ts) : null;
  if (!t) return null;
  t.players.push(p);
  if (p.role === '投手') t.pitchers.push(p.id);
  if (p.role === '野手' && t.players.filter((x) => x.role === '野手').length >= MIN_FIELDERS) autoLineup(t);
  autoPitchers(t);
  return t;
}

/**
 * 大物にオファーを出す.勝てば上乗せした年俸で入団,負ければ他球団へ.
 * @returns 結果(won)と知らせの文.予算などで出せないときは error.
 */
export function offerFA(c: Career, id: number, mult: number, sign: (c: Career, id: number) => string | null): { won: boolean; text: string; error?: string } {
  const p = c.fa.find((x) => x.id === id);
  if (!p) return { won: false, text: '', error: '選手が見つかりません.' };
  const salary = Math.round((p.salary * mult) / 10) * 10;
  if (projectedPayroll(c) + salary > budgetFor(c)) return { won: false, text: '', error: '年俸の予算を超えてしまいます.' };
  const chance = faChance(c, p, mult);
  if (rand() < chance) {
    const before = p.salary;
    p.salary = salary;
    const err = sign(c, id);
    if (err) { p.salary = before; return { won: false, text: '', error: err }; }
    return { won: true, text: `${p.name}の争奪戦に勝ち,年俸${salary}万円で契約しました!` };
  }
  c.fa = c.fa.filter((x) => x !== p);
  const t = signElsewhere(c, p);
  return { won: false, text: `${p.name}は${t ? t.name : '他球団'}と契約しました.争奪戦に敗れました.` };
}

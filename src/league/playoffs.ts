/** プレーオフと全日本選手権の,勝つ確率.DOM に依存しない. */
import type { Career, LeagueState, Team } from '../types';
import { CUP_START } from './calendar';
import { winProb } from './finance';
import { teamById } from './schedule';

/** 1 試合の勝率が p のとき,先に wins 勝するシリーズに勝つ確率 */
export function seriesWinProb(p: number, wins: number): number {
  let total = 0;
  for (let k = 0; k < wins; k++) {
    // k 敗して,wins 勝目を取る並べ方
    let comb = 1;
    for (let i = 1; i <= k; i++) comb = (comb * (wins - 1 + i)) / i;
    total += comb * p ** wins * (1 - p) ** k;
  }
  return total;
}

export interface SeriesInfo {
  kind: 'playoff' | 'cup';
  /** 「準決勝」などの呼び名 */
  label: string;
  opp: Team | null;
  /** 先に何勝すればよいか */
  wins: number;
  /** 1 試合の勝率 */
  pGame: number;
  /** シリーズを勝ち抜く確率 */
  pSeries: number;
}

/** いま(今週)のプレイヤーのプレーオフまたは選手権の対戦.なければ null. */
export function userSeries(c: Career): SeriesInfo | null {
  const u = c.teams.find((t) => t.user)!;
  const lg = c.leagues[c.level];
  const po = lg.po;
  const mk = (kind: 'playoff' | 'cup', label: string, opp: Team | null, wins: number): SeriesInfo => {
    const pGame = opp ? winProb(u, opp) : 1;
    return { kind, label, opp, wins, pGame, pSeries: opp ? seriesWinProb(pGame, wins) : 1 };
  };
  if (po && c.cal === 40 && po.seeds.includes(u.id)) {
    const i = po.seeds.indexOf(u.id), j = [3, 2, 1, 0][i];
    return mk('playoff', 'プレーオフ 準決勝(3戦先に2勝)', teamById(c, po.seeds[j]), 2);
  }
  if (po && c.cal === 41 && po.semiWinners.includes(u.id)) {
    return mk('playoff', 'プレーオフ 決勝(5戦先に3勝)', teamById(c, po.semiWinners.find((x) => x !== u.id)!), 3);
  }
  const cup = c.cup;
  if (cup && !cup.done && c.cal === CUP_START + cup.round) {
    const i = cup.slots.indexOf(u.id);
    if (i >= 0) {
      const other = cup.slots[i % 2 === 0 ? i + 1 : i - 1];
      return mk('cup', '全日本選手権(1試合勝負)', other === null ? null : teamById(c, other), 1);
    }
  }
  return null;
}

/** プレーオフ 4 チームそれぞれの優勝確率(上位シード順).決まっていない段階でも出せる. */
export function playoffOdds(c: Career, lg: LeagueState): { team: Team; champion: number }[] {
  const po = lg.po;
  if (!po) return [];
  const T = po.seeds.map((id) => teamById(c, id));
  const p = (a: Team, b: Team, w: number): number => seriesWinProb(winProb(a, b), w);
  if (po.champion !== null) return T.map((t) => ({ team: t, champion: t.id === po.champion ? 1 : 0 }));
  if (po.semiWinners.length === 2) {
    const [x, y] = po.semiWinners.map((id) => teamById(c, id));
    const px = p(x, y, 3);
    return T.map((t) => ({ team: t, champion: t.id === x.id ? px : t.id === y.id ? 1 - px : 0 }));
  }
  const s01 = p(T[0], T[3], 2), s12 = p(T[1], T[2], 2);
  // 決勝の組み合わせごとに,確率を足し合わせる
  const win = (a: Team, b: Team): number => p(a, b, 3);
  const c0 = s01 * (s12 * win(T[0], T[1]) + (1 - s12) * win(T[0], T[2]));
  const c3 = (1 - s01) * (s12 * win(T[3], T[1]) + (1 - s12) * win(T[3], T[2]));
  const c1 = s12 * (s01 * win(T[1], T[0]) + (1 - s01) * win(T[1], T[3]));
  const c2 = (1 - s12) * (s01 * win(T[2], T[0]) + (1 - s01) * win(T[2], T[3]));
  return [c0, c1, c2, c3].map((v, i) => ({ team: T[i], champion: v }));
}

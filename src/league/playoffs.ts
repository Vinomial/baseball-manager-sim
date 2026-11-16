/** プレーオフと全日本選手権の,勝つ確率.DOM に依存しない. */
import type { Career, Team } from '../types';
import { CUP_START, poEntrants, poRoundName, poWins, userPoRound, userTierPO } from './calendar';
import { winProb } from './finance';
import { teamById } from './schedule';
import { userCupDef } from '../data/cups';
import { LEAGUES } from '../data/constants';

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
  const mk = (kind: 'playoff' | 'cup', label: string, opp: Team | null, wins: number): SeriesInfo => {
    const pGame = opp ? winProb(u, opp) : 1;
    return { kind, label, opp, wins, pGame, pSeries: opp ? seriesWinProb(pGame, wins) : 1 };
  };
  const r = userPoRound(c), tp = userTierPO(c);
  if (r >= 0 && tp) {
    const ents = poEntrants(tp, r), i = ents.indexOf(u.id);
    const other = ents[i % 2 === 0 ? i + 1 : i - 1];
    const n = tp.seeds.length, w = poWins(n, r);
    return mk('playoff', `昇格プレーオフ ${poRoundName(n, r, c.level < LEAGUES.length - 1)}(${w * 2 - 1}戦先に${w}勝)`, other === null ? null : teamById(c, other), w);
  }
  const cup = c.cup;
  if (cup && !cup.done && c.cal === CUP_START + cup.round) {
    const i = cup.slots.indexOf(u.id);
    if (i >= 0) {
      const other = cup.slots[i % 2 === 0 ? i + 1 : i - 1];
      return mk('cup', `${userCupDef(c).name}(1試合勝負)`, other === null ? null : teamById(c, other), 1);
    }
  }
  return null;
}

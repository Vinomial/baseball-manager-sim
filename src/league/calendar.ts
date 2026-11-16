/** 1 年 = 12 か月 × 4 週 = 48 週.週ごとに何が行われるか. */
import type { Career, GameKind, TierPlayoff } from '../types';
import { userLeague } from './schedule';
import { roundName, userCupDef } from '../data/cups';
import { LEAGUES } from '../data/constants';

export const WEEKS_PER_YEAR = 48;
/** リーグ戦は 4 月(12 週目)から 10 月第 3 週までの 27 週 */
export const SEASON_START = 12;
export const SEASON_WEEKS = 27;
/** 昇格プレーオフがありうる最初の週(草野球の 8 チームの 1 回戦).4 チームの階層は次の週から */
export const PLAYOFF_START = 39;
export const CUP_START = 42;
export const CUP_ROUNDS = 6;
/** 1 週あたりの練習量(1 年でおよそ 10 週ぶん) */
export const TRAIN_PER_WEEK = 10 / WEEKS_PER_YEAR;

/** キャンプの期間(1〜2月).レギュラー特訓の目標とコンバートは,この間に決める */
export const CAMP_END = 8;
export const campOpen = (c: Career): boolean => c.phase === 'season' && c.cal < CAMP_END;
export const CAMP_ONLY = 'レギュラー特訓とコンバートは,キャンプ(1〜2月)のあいだにホームで決めます.';

/** 昇格プレーオフの回戦の数(4 チームなら 2,8 チームなら 3) */
export const poRounds = (n: number): number => Math.max(1, Math.round(Math.log2(Math.max(2, n))));
/** r 回戦が行われる週.決勝はどの階層も選手権の前の週 */
export const poWeek = (n: number, r: number): number => CUP_START - poRounds(n) + r;
/** この週に行う回戦(なければ -1) */
export function poRoundAt(tp: TierPlayoff, cal: number): number {
  const r = cal - (CUP_START - poRounds(tp.seeds.length));
  return r >= 0 && r < poRounds(tp.seeds.length) ? r : -1;
}
/** r 回戦に出るチーム(表の上から順.決まっていなければ null) */
export function poEntrants(tp: TierPlayoff, r: number): (number | null)[] {
  const n = tp.seeds.length / 2 ** r;
  const src = r === 0 ? tp.seeds : tp.wins[r - 1] ?? [];
  return Array.from({ length: n }, (_, i) => src[i] ?? null);
}
/** 回戦の呼び名.1 回戦は昇格がかかる(最上位の階層は除く) */
export function poRoundName(n: number, r: number, promo: boolean): string {
  const left = poRounds(n) - r;
  const base = left === 1 ? '決勝' : left === 2 ? '準決勝' : '準々決勝';
  return r === 0 && promo ? `${base}(昇格決定戦)` : base;
}
/** 回戦で先に何勝すればよいか(決勝は 3 勝,ほかは 2 勝) */
export const poWins = (n: number, r: number): number => (poRounds(n) - r === 1 ? 3 : 2);

export type WeekKind = 'prep' | 'camp' | 'open' | 'league' | 'playoff' | 'cup' | 'end';

export interface WeekInfo {
  cal: number;
  month: number;
  wk: number;
  kind: WeekKind;
  /** 「4月 第1週」のような表示 */
  label: string;
  /** その週の名前 */
  title: string;
  note: string;
  /** プレイヤーの公式戦(あれば) */
  userGame: Exclude<GameKind, 'practice'> | null;
  /** 練習の伸びの倍率 */
  trainMult: number;
}

/** 各試合を暦の週に割り振る.試合数が少ないリーグほど間があく. */
export function scheduleWeeks(games: number): number[] {
  return Array.from({ length: games }, (_, k) => SEASON_START + Math.floor((k * SEASON_WEEKS) / games));
}

export function weekKind(cal: number): WeekKind {
  if (cal < 4) return 'prep';
  if (cal < 8) return 'camp';
  if (cal < 12) return 'open';
  if (cal < PLAYOFF_START) return 'league';
  if (cal < CUP_START) return 'playoff';
  if (cal < CUP_START + CUP_ROUNDS) return 'cup';
  return 'end';
}

/** プレイヤーの選手権の,今週の回戦の名前 */
export function cupRoundName(c: Career, round: number): string {
  const n = c.cup ? c.cup.slots.length / 2 ** Math.max(0, round - c.cup.round) : 2 ** (CUP_ROUNDS - round);
  return roundName(Math.max(2, n), round);
}

/** プレイヤーの階層の昇格プレーオフ */
export const userTierPO = (c: Career): TierPlayoff | null => c.tpo?.find((x) => x.level === c.level) ?? null;

/** プレイヤーが今週プレーオフに出るなら,その回戦(出ないなら -1) */
export function userPoRound(c: Career): number {
  const tp = userTierPO(c);
  if (!tp) return -1;
  const r = poRoundAt(tp, c.cal);
  return r >= 0 && !tp.wins[r] && poEntrants(tp, r).includes(c.userId) ? r : -1;
}

/** プレイヤーがこの週に出る公式戦 */
export function userGameKind(c: Career): Exclude<GameKind, 'practice'> | null {
  const lg = userLeague(c);
  if (c.cal >= SEASON_START && c.cal < PLAYOFF_START) {
    return lg.week < lg.schedule.length && lg.weeks[lg.week] <= c.cal ? 'league' : null;
  }
  if (userPoRound(c) >= 0) return 'playoff';
  if (c.cup && !c.cup.done && c.cal === CUP_START + c.cup.round && c.cup.slots.includes(c.userId)) return 'cup';
  return null;
}

export function weekInfo(c: Career): WeekInfo {
  const cal = c.cal, kind = weekKind(cal);
  const month = Math.floor(cal / 4) + 1, wk = (cal % 4) + 1;
  const userGame = userGameKind(c);
  const base = { cal, month, wk, label: `${month}月 第${wk}週`, userGame, trainMult: 1 };
  switch (kind) {
    case 'prep': return { ...base, kind, title: '自主トレ', note: '新しい年の始まりです.体づくりの時期です.' };
    case 'camp': return { ...base, kind, title: '春季キャンプ', note: 'キャンプでは練習の伸びが大きくなります.', trainMult: 1.25 };
    case 'open': return { ...base, kind, title: 'オープン戦', note: '公式戦の前の調整試合です.今週は,オープン戦が1試合,自動で組まれます.成績には入りませんが,選手の疲れや経験はたまります.' };
    case 'league': return {
      ...base, kind, title: userGame ? 'リーグ戦' : 'リーグ戦(試合のない週)',
      note: userGame ? '' : '今週は公式戦がありません.練習試合を組むか,練習や休養にあてましょう.',
    };
    case 'playoff': {
      const tp = userTierPO(c), r = tp ? poRoundAt(tp, cal) : -1;
      const promo = c.level < LEAGUES.length - 1;
      const name = tp && r >= 0 ? poRoundName(tp.seeds.length, r, promo) : '';
      return {
        ...base, kind, title: name ? `昇格プレーオフ ${name}` : '昇格プレーオフ',
        note: userGame ? (r === 0 && promo ? 'この回戦に勝てば,1 つ上の階層へ昇格です.' : '勝てば次へ進めます.')
          : tp && r < 0 && tp.seeds.includes(c.userId) ? '来週から昇格プレーオフです.体を整えておきましょう.'
            : 'プレーオフに出ない週です.練習や休養にあてましょう.',
      };
    }
    case 'cup': return {
      ...base, kind, title: `${userCupDef(c).name} ${cupRoundName(c, cal - CUP_START)}`,
      note: userGame ? '近い階層のチームが一堂に会する大会です.格上を倒せば大金星です.' : `${userCupDef(c).short}は終わりました.練習や休養にあてましょう.`,
    };
    default: return { ...base, kind: 'end', title: '年末', note: '1年の締めくくりです.来年に向けて,体を休めましょう.' };
  }
}

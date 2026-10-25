/** 1 年 = 12 か月 × 4 週 = 48 週.週ごとに何が行われるか. */
import type { Career, GameKind } from '../types';

export const WEEKS_PER_YEAR = 48;
/** リーグ戦は 4 月(12 週目)から 10 月までの 28 週 */
export const SEASON_START = 12;
export const SEASON_WEEKS = 28;
export const PLAYOFF_START = 40;
export const CUP_START = 42;
export const CUP_ROUNDS = 5;
/** 1 週あたりの練習量(1 年でおよそ 10 週ぶん) */
export const TRAIN_PER_WEEK = 10 / WEEKS_PER_YEAR;

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

const CUP_NAMES = ['1回戦', '2回戦', '準々決勝', '準決勝', '決勝'];
export const cupRoundName = (round: number): string => CUP_NAMES[round] ?? `${round + 1}回戦`;

/** プレイヤーがこの週に出る公式戦 */
export function userGameKind(c: Career): Exclude<GameKind, 'practice'> | null {
  const lg = c.leagues[c.level];
  if (c.cal >= SEASON_START && c.cal < PLAYOFF_START) {
    return lg.week < lg.schedule.length && lg.weeks[lg.week] <= c.cal ? 'league' : null;
  }
  if (c.cal === PLAYOFF_START && lg.po?.seeds.includes(c.userId)) return 'playoff';
  if (c.cal === PLAYOFF_START + 1 && lg.po?.semiWinners.includes(c.userId)) return 'playoff';
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
    case 'open': return { ...base, kind, title: 'オープン戦', note: '公式戦の前の調整です.練習試合を組んで,試してみましょう.' };
    case 'league': return {
      ...base, kind, title: userGame ? 'リーグ戦' : 'リーグ戦(試合のない週)',
      note: userGame ? '' : '今週は公式戦がありません.練習試合を組むか,練習や休養にあてましょう.',
    };
    case 'playoff': return {
      ...base, kind, title: cal === PLAYOFF_START ? 'プレーオフ 準決勝' : 'プレーオフ 決勝',
      note: userGame ? '勝てば次へ進めます.' : 'プレーオフに出ない週です.練習や休養にあてましょう.',
    };
    case 'cup': return {
      ...base, kind, title: `全日本選手権 ${cupRoundName(cal - CUP_START)}`,
      note: userGame ? '全リーグが一堂に会する大会です.勝ち上がれば大金星です.' : '全日本選手権は敗退しました.練習や休養にあてましょう.',
    };
    default: return { ...base, kind: 'end', title: '年末', note: '1年の締めくくりです.来年に向けて,体を休めましょう.' };
  }
}

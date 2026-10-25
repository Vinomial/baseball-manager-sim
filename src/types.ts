/** 型定義.ゲーム全体で共有するデータ構造をここにまとめる. */

export type Role = '野手' | '投手';
export type Pos = '捕' | '一' | '二' | '三' | '遊' | '左' | '中' | '右';
export type LineupPos = Pos | '指';
export type BatKey = 'meet' | 'power' | 'speed' | 'field';
export type PitKey = 'velo' | 'ctrl' | 'stam';
export type AttrKey = BatKey | PitKey;
export type GrowthType = '早熟' | '普通' | '晩成';

export interface Stats {
  // 野手
  pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; so: number; sb: number;
  // 共通
  g: number;
  // 投手
  outs: number; r: number; k: number; w: number; l: number;
  /** 被安打と与四球 */
  ha: number; bba: number;
}

export interface Player {
  id: number;
  name: string;
  age: number;
  type: GrowthType;
  role: Role;
  /** 本職の守備位置.投手は '投'. */
  pos: Pos | '投';
  /** 調子 0(絶不調)〜4(絶好調) */
  cond: number;
  /** 疲労 0〜100(主に投手) */
  fatigue: number;
  meet: number; power: number; speed: number; field: number;
  velo: number; ctrl: number; stam: number;
  /** 能力ごとの上限(プレイヤーには直接見せない) */
  pot: Record<AttrKey, number>;
  stats: Stats;
  /** ドラフト候補のときだけ付く,能力の見積もり幅 */
  scout?: Partial<Record<AttrKey, [number, number]>>;
}

export interface LineupEntry { pid: number; pos: LineupPos; }

export interface Team {
  id: number;
  name: string;
  user: boolean;
  players: Player[];
  lineup: LineupEntry[];
  /** 先頭3人が先発ローテーション,残りが中継ぎ */
  pitchers: number[];
  rotIdx: number;
  chem: Record<string, number>;
  /** 連携の初期値 */
  baseChem: number;
}

export interface Standing { w: number; l: number; d: number; rf: number; ra: number; }

export interface OffSeason {
  rank: number;
  rec: Standing;
  move: -1 | 0 | 1;
  from: number;
  retired: string[];
  draft: Player[];
  /** null: 未決定,'-': 見送り,それ以外: 指名した選手名 */
  drafted: string | null;
}

/** 週ごとのチーム能力の記録(グラフ用).各能力は先発メンバーの平均. */
export interface HistPoint {
  season: number;
  /** 消化した試合数 */
  week: number;
  level: number;
  ovr: number;
  attrs: Record<AttrKey, number>;
}

export interface ResultRow {
  season: number;
  week: number;
  opp: string;
  us: number;
  them: number;
  home: boolean;
}

export interface Career {
  version: number;
  nid: number;
  tid: number;
  season: number;
  week: number;
  level: number;
  phase: 'season' | 'off';
  teams: Team[];
  schedule: [number, number][][];
  stand: Record<number, Standing>;
  userId: number;
  last: string | null;
  off: OffSeason | null;
  hist: HistPoint[];
  /** 今シーズンのプレイヤーの試合結果 */
  results: ResultRow[];
}

/* ===== 試合 ===== */

export interface SideLineup { p: Player; pos: LineupPos; }

export interface Side {
  team: Team;
  lineup: SideLineup[];
  /** チーム守備力 */
  D: number;
  catcher: Player;
  sec: Player;
  ss: Player;
  /** 次の打者の打順インデックス */
  bi: number;
  pitcher: Player;
  starter: Player;
  used: Player[];
  /** 現投手の球数 */
  pc: number;
  /** 現投手の失点 */
  pr: number;
  pcBy: Record<number, number>;
  runs: number;
  hits: number;
  inn: number[];
}

/** a, h はその時点の得点(ビジター,ホーム) */
export interface LogEntry { tag: string; t: string; hl: boolean; a: number; h: number; }

export interface Game {
  home: Side;
  away: Side;
  inning: number;
  /** 0: 表,1: 裏 */
  half: 0 | 1;
  outs: number;
  bases: (Player | null)[];
  log: LogEntry[];
  logOn: boolean;
  /** 試合開始時の成績.試合内の成績は現在の成績との差で出す. */
  snap: Record<number, Stats>;
  over: boolean;
}

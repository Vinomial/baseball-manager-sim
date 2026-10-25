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

/** 過去のシーズンの成績 1 行 */
export interface SeasonLine {
  season: number;
  level: number;
  team: string;
  age: number;
  stats: Stats;
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
  /** ドラフト候補のときだけ付く,伸びしろの見積もり(能力値の幅) */
  scoutPot?: [number, number];
  /** 過去のシーズンの成績(古い順) */
  seasons: SeasonLine[];
  /** 自由契約になる前の所属チーム */
  prev?: string;
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

export interface DraftPick { round: number; teamId: number; team: string; pid: number; name: string; user: boolean; }

export interface DraftState {
  /** 指名できる候補 */
  pool: Player[];
  /** 指名順(チーム ID).ラウンドごとに繰り返す */
  order: number[];
  idx: number;
  picks: DraftPick[];
  done: boolean;
}

export interface LeagueState {
  level: number;
  teamIds: number[];
  schedule: [number, number][][];
  stand: Record<number, Standing>;
  /** 消化した試合数 */
  week: number;
}

export interface ChampRow { season: number; level: number; team: string; teamId: number; runnerUp: string; }

export interface OffSeason {
  rank: number;
  rec: Standing;
  move: -1 | 0 | 1;
  from: number;
  /** 来シーズンのリーグ */
  to: number;
  /** 全チームの来シーズンのリーグ */
  next: Record<number, number>;
  retired: string[];
  /** プレーオフの結果(プレイヤーのリーグ) */
  playoff: string;
  draft: DraftState;
  /** 自由契約で獲得した選手名 */
  signed: string[];
  /** 放出した選手名 */
  released: string[];
}

export interface AwardRow {
  season: number;
  level: number;
  kind: string;
  pid: number;
  name: string;
  team: string;
  text: string;
  /** プレイヤーのチームの選手か */
  mine: boolean;
}

/** 引退した名選手 */
export interface LegendRow {
  name: string;
  pos: string;
  team: string;
  lastSeason: number;
  years: number;
  /** 在籍中に最も高かったリーグ */
  level: number;
  line: string;
  score: number;
  mine: boolean;
}

export interface Record3 { w: number; l: number; d: number; }

/** プレイヤーのチーム全体の記録 */
export interface TeamRecords {
  streak: number;
  bestStreak: number;
  total: Record3;
  /** 1シーズンの最多勝 */
  bestWins: number;
  bestSeason: number;
  /** 優勝の回数(リーグごと) */
  titles: number[];
  /** プロリーグの連覇(いま続いている回数) */
  proStreak: number;
}

export interface EventChoice { key: string; label: string; hint: string; }

/** 週のはじめに起きる出来事.プレイヤーが選んで決める. */
export interface GameEvent {
  kind: string;
  title: string;
  body: string;
  /** 関わる選手(ID) */
  pid?: number;
  pid2?: number;
  /** トレード相手のチーム */
  teamId?: number;
  choices: EventChoice[];
}

export interface Career {
  version: number;
  nid: number;
  tid: number;
  season: number;
  /** プレイヤーのリーグで消化した試合数 */
  week: number;
  /** プレイヤーの今のリーグ(オフの間は昇格前) */
  level: number;
  phase: 'season' | 'off';
  /** 全リーグの全チーム */
  teams: Team[];
  /** リーグごとの日程と順位.添え字がリーグ. */
  leagues: LeagueState[];
  userId: number;
  last: string | null;
  off: OffSeason | null;
  hist: HistPoint[];
  /** 今シーズンのプレイヤーの試合結果 */
  results: ResultRow[];
  /** 自由契約の選手 */
  fa: Player[];
  /** 各リーグの優勝の記録 */
  champs: ChampRow[];
  /** 解除した実績(実績の ID → 解除したシーズン) */
  ach: Record<string, number>;
  /** まだ見ていない知らせ(実績の解除など) */
  news: string[];
  awards: AwardRow[];
  legends: LegendRow[];
  /** 対戦成績(相手チームの ID ごと) */
  h2h: Record<number, Record3>;
  rival: number | null;
  rec: TeamRecords;
  /** 殿堂入りのエンディングを見たか */
  ended: boolean;
  /** いま選べる出来事 */
  event: GameEvent | null;
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

export type PlayKind = 'k' | 'bb' | 'hit' | 'xbh' | 'hr' | 'gro' | 'fly' | 'dp' | 'sf' | 'err' | 'sub' | 'info';

/** 1打席ごとの記録.a, h はその時点の得点(ビジター,ホーム).再生にも使う. */
export interface LogEntry {
  tag: string;
  t: string;
  hl: boolean;
  a: number;
  h: number;
  inning: number;
  half: 0 | 1;
  kind: PlayKind;
  /** 打席後のアウト数(3 でチェンジ) */
  outs: number;
  /** 打席後の走者の名前(いなければ空) */
  bases: [string, string, string];
  batter: string;
  pitcher: string;
}

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

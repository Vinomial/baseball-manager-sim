/** 型定義.ゲーム全体で共有するデータ構造をここにまとめる. */

export type Role = '野手' | '投手';
export type Pos = '捕' | '一' | '二' | '三' | '遊' | '左' | '中' | '右';
export type LineupPos = Pos | '指';
export type BatKey = 'meet' | 'power' | 'speed' | 'field';
export type PitKey = 'velo' | 'ctrl' | 'stam';
export type AttrKey = BatKey | PitKey;
export type PitchKey = 'slider' | 'curve' | 'fork' | 'change' | 'sinker' | 'cutter';
export type SkillKey =
  | 'clutch' | 'contact' | 'slugger' | 'eye' | 'runner' | 'glove'   // 野手
  | 'closer' | 'iron' | 'ace' | 'killer';                           // 投手
export type Personality = 'fighter' | 'cool' | 'pace' | 'leader' | 'sensitive';
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
  /** 二塁打と三塁打 */
  d2: number; t3: number;
}

/** 過去のシーズンの成績 1 行 */
export interface SeasonLine {
  season: number;
  level: number;
  team: string;
  age: number;
  stats: Stats;
  /** その年の終わりの能力(成長のグラフ用) */
  attrs?: Partial<Record<AttrKey, number>>;
}

export interface Injury { name: string; weeks: number; /** 大怪我(能力が下がる)か */ major: boolean; }

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
  /** 疲労 0〜100 */
  fatigue: number;
  /** 怪我(治るまでの週数).なければ null. */
  inj?: Injury | null;
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
  /** 年俸(万円) */
  salary: number;
  /** 投手の球種とそのレベル(1〜5) */
  pitches: Partial<Record<PitchKey, number>>;
  /** 特殊能力 */
  skills: SkillKey[];
  /** 自由契約になる前の所属チーム */
  prev?: string;
  /** 性格 */
  pers: Personality;
  /** やる気 0〜100 */
  morale: number;
  /** スカウトが見つけた注目選手か */
  watched?: boolean;
  /** 覚えたサブポジション(守備の落ち込みが小さい) */
  alt?: Pos[];
  /** コンバート(守備位置の転向)の最中.left 週で完了. */
  conv?: { to: Pos; left: number } | null;
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
  /** 選手同士の絆(師弟など).[選手ID, 選手ID] */
  bonds: [number, number][];
  /** 医務室のレベル(怪我の起きにくさ・治りの早さ).プレイヤーのチームだけ. */
  med?: number;
  /** 監督の作戦による試合の補正.プレイヤーのチームだけ. */
  staffFx?: { hit: number; hr: number; k: number; dp: number; def: number; cmd: number };
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
  /** 試合前の予想勝率(0〜1) */
  prob?: number;
  kind?: GameKind;
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

export type GameKind = 'league' | 'playoff' | 'cup' | 'practice';

/** プレーオフの進み具合(上位4チーム) */
export interface PlayoffState {
  /** 順位の高い順の 4 チーム */
  seeds: number[];
  semiWinners: number[];
  champion: number | null;
  runnerUp: number | null;
}

/** 年末の全日本選手権の進行 */
export interface CupLive {
  /** いま残っているチーム(対戦表の並び.不戦勝の空きは null) */
  slots: (number | null)[];
  /** 次に行う回戦(0 から) */
  round: number;
  done: boolean;
}

export interface LeagueState {
  level: number;
  teamIds: number[];
  schedule: [number, number][][];
  stand: Record<number, Standing>;
  /** 消化した試合数 */
  week: number;
  /** 各試合が行われる暦の週(0〜47) */
  weeks: number[];
  /** 地区(あるリーグだけ).各地区の上位2チームがプレーオフに進む. */
  divs?: number[][];
  /** 節ごとの各チームの順位(順位の遷移グラフ用) */
  rankHist: Record<number, number[]>;
  po: PlayoffState | null;
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
  /** 全日本選手権でのプレイヤーの結果 */
  cup: string;
  /** 1 年の振り返り */
  review?: Review;
  /** 新人の入団会見のコメント */
  press?: string[];
  /** 契約更改の交渉待ち */
  contracts?: ContractAsk[];
  /** 自由契約で獲得した選手名 */
  signed: string[];
  /** 放出した選手名 */
  released: string[];
  /** いまのオフの段階(0 結果,1 戦力外,2 ドラフト,3 自由契約) */
  step: number;
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

export type Ingredient = 'rice' | 'meat' | 'fish' | 'veg' | 'fruit' | 'egg';

/** ミッション.達成すると食材がもらえる. */
export interface Mission {
  id: number;
  kind: string;
  title: string;
  target: number;
  progress: number;
  reward: Partial<Record<Ingredient, number>>;
}

/** 食べた料理の効き目 */
export interface Meal {
  name: string;
  /** 効き目が残る試合数 */
  weeks: number;
  /** 能力ごとの練習の伸びの倍率(all は指定のない能力) */
  mult: Partial<Record<AttrKey | 'all', number>>;
  desc: string;
}

export interface CupMatch {
  round: string;
  a: string;
  b: string;
  aId: number;
  bId: number;
  sa: number;
  sb: number;
  winner: number;
}

export interface CupRow { season: number; champion: string; championId: number; championLevel: number; runnerUp: string; }

export type FacKey = 'stadium' | 'ground' | 'clinic' | 'canteen' | 'scout';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 1 年の振り返り */
export interface Review {
  /** プレイヤーのリーグの優勝チーム */
  champion: string;
  ownTitle: boolean;
  mvp: { name: string; team: string; text: string } | null;
  rookie: { name: string; team: string; text: string } | null;
  growers: { name: string; delta: number }[];
  goals: GoalResult[];
  fundsDelta: number;
  cupChampion: boolean;
}

export type StaffRole = 'manager' | 'batting' | 'pitching' | 'defense' | 'trainer' | 'mental';
export type ManagerStyle = 'aggressive' | 'defensive' | 'balanced' | 'developer';

/** あなた(GM)が雇う,監督やコーチ */
export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  age: number;
  /** 能力 1〜100 */
  skill: number;
  /** 監督の作戦のタイプ */
  style?: ManagerStyle;
  /** 年俸(万円) */
  salary: number;
  /** 在任年数 */
  years: number;
}

/** 球団オーナーの目標(毎年) */
export interface Goal {
  kind: 'rank' | 'wins' | 'title' | 'cup' | 'grow';
  target: number;
  text: string;
  /** 達成したときの報酬 */
  reward: { trust: number; funds: number };
}

export interface GoalResult { text: string; done: boolean; rewardText: string; }

/** 契約更改で,選手が要求している年俸 */
export interface ContractAsk { pid: number; old: number; ask: number; }

export interface Career {
  version: number;
  nid: number;
  tid: number;
  season: number;
  /** プレイヤーのリーグで消化した試合数 */
  week: number;
  /** 暦の週(0〜47).12か月×4週. */
  cal: number;
  /** 全日本選手権の進行 */
  cup: CupLive | null;
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
  /** GMの信頼度 0〜100.0 になると解任される. */
  trust: number;
  /** 資金(万円).入場収入や食材の売却で増え,施設に使う. */
  funds: number;
  /** 難易度 */
  diff: Difficulty;
  /** 何周目か(殿堂入りのあとの引き継ぎで増える) */
  gen: number;
  /** 前の周回までの記録 */
  legacy: { titles: number; seasons: number } | null;
  /** おまかせ進行 */
  auto: { lineup: boolean; rest: boolean; mode: 'ability' | 'form' | 'develop'; /** 練習の決め方 */ train: 'recommend' | 'fixed' | 'manual'; /** 「固定」のときの練習メニュー */ fixed: string };
  /** 雇っている監督・コーチ */
  staff: Record<StaffRole, Staff | null>;
  /** 雇えるスタッフの候補 */
  staffPool: Staff[];
  /** 年の初めの記録(振り返り用) */
  yearStart: { funds: number; attrs: Record<number, number> };
  /** 施設のレベル(0〜5) */
  fac: Record<FacKey, number>;
  /** 食材の相場(1.0 が標準) */
  market: Record<Ingredient, number>;
  /** 今年のオーナーの目標 */
  goals: Goal[];
  /** スカウトの派遣中(あと何週で戻るか) */
  scout: { weeks: number; type: '野手' | '投手' | '素質' } | null;
  /** スカウトが見つけた注目選手(ドラフトに出る) */
  watch: Player[];
  missions: Mission[];
  /** 年末の全日本選手権の優勝の記録 */
  cups: CupRow[];
  /** 直近の全日本選手権の対戦表 */
  cupBracket: CupMatch[];
  /** 直近の練習メニュー(新しいものが後ろ) */
  lastMenus: string[];
  pantry: Record<Ingredient, number>;
  meal: Meal | null;
  /** 次のミッションの ID */
  mid: number;
  /** 前のシーズンの成績による収入の倍率.予算に掛かる. */
  revenue: number;
  /** 解任されたときの記録 */
  fired: { season: number; text: string } | null;
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
  /** 発動しているコンボの補正 */
  fx: { hit: number; hr: number; k: number; dp: number; def: number; cmd: number };
  combos: string[];
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
  /** この試合で怪我をした選手 */
  injured: Player[];
  over: boolean;
}

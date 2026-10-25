import type { GrowthReport, MenuKey } from '../growth/training';
import type { Career, Game, GameKind } from '../types';

export type Tab = 'home' | 'game' | 'team' | 'table' | 'rec';
export type Screen = 'title' | 'new' | 'play';
export type TeamSub = 'power' | 'players' | 'order';

export type Selection =
  | { t: 'l'; i: number }   // 打順
  | { t: 'b'; id: number }  // 控え
  | { t: 'p'; i: number };  // 投手

/** 直近の試合の結果と練習の成果 */
export interface LastWeek {
  /** プレーオフなどでは複数 */
  games: Game[];
  /** 見ている試合(games の中の 1 つ).試合のない週は null */
  game: Game | null;
  kind: GameKind | null;
  menu: MenuKey;
  report: GrowthReport[];
}

/** 画面の状態.Career(セーブ対象)と分けて持つ. */
export interface AppState {
  career: Career | null;
  last: LastWeek | null;
  /** いまの画面.タイトル,新規作成,プレイ中 */
  screen: Screen;
  /** 右上のメニューが開いているか */
  menuOpen: boolean;
  /** 詳細を開いている選手の ID */
  detail: number | null;
  tab: Tab;
  /** チームタブの中の表示 */
  sub: TeamSub;
  /** 折りたたみの開閉.再描画しても保たれる. */
  folds: Record<string, boolean>;
  menu: MenuKey;
  /** プレイヤーが練習を自分で選んだか(選んでいなければおすすめを選んでおく) */
  menuTouched: boolean;
  sel: Selection | null;
  open: number | null;
  /** 順位タブで見ているリーグ.null ならプレイヤーのリーグ */
  viewLevel: number | null;
  /** 順位タブで選手一覧を開いているチーム */
  viewTeam: number | null;
  /** 自由契約の表示 */
  faRole: '野手' | '投手';
  /** 試合のあとに結果を自動で開くか(切ると,試合を見ずに次へ進める) */
  autoOpen: boolean;
  /** 試合のない週に練習試合を組むか */
  practice: boolean;
}

const AUTO_KEY = 'baseball-manager-sim/autoOpen';
function readAutoOpen(): boolean {
  try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; }
}
export function writeAutoOpen(v: boolean): void {
  try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* 保存できなくても動く */ }
}

export const state: AppState = {
  career: null, last: null, screen: 'title', menuOpen: false, detail: null, tab: 'home', sub: 'power', folds: {}, menu: 'bat', menuTouched: false, sel: null, open: null, viewLevel: null, viewTeam: null, faRole: '野手',
  autoOpen: readAutoOpen(),
  practice: false,
};

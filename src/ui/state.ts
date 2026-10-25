import type { GrowthReport, MenuKey } from '../growth/training';
import type { Career, Game } from '../types';

export type Tab = 'home' | 'game' | 'team' | 'players' | 'order' | 'table' | 'rec';

export type Selection =
  | { t: 'l'; i: number }   // 打順
  | { t: 'b'; id: number }  // 控え
  | { t: 'p'; i: number };  // 投手

/** 直近の試合の結果と練習の成果 */
export interface LastWeek {
  game: Game;
  menu: MenuKey;
  report: GrowthReport[];
}

/** 画面の状態.Career(セーブ対象)と分けて持つ. */
export interface AppState {
  career: Career | null;
  last: LastWeek | null;
  tab: Tab;
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
}

const AUTO_KEY = 'baseball-manager-sim/autoOpen';
function readAutoOpen(): boolean {
  try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; }
}
export function writeAutoOpen(v: boolean): void {
  try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* 保存できなくても動く */ }
}

export const state: AppState = {
  career: null, last: null, tab: 'home', menu: 'bat', menuTouched: false, sel: null, open: null, viewLevel: null, viewTeam: null, faRole: '野手',
  autoOpen: readAutoOpen(),
};

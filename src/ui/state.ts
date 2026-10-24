import type { GrowthReport, MenuKey } from '../growth/training';
import type { Career, Game, Tactic } from '../types';

export type Tab = 'home' | 'game' | 'players' | 'order' | 'table';

export type Selection =
  | { t: 'l'; i: number }   // 打順
  | { t: 'b'; id: number }  // 控え
  | { t: 'p'; i: number };  // 投手

/** 画面の状態.Career(セーブ対象)と分けて持つ. */
export interface AppState {
  career: Career | null;
  game: Game | null;
  tab: Tab;
  menu: MenuKey;
  sel: Selection | null;
  open: number | null;
  report: { menu: MenuKey; rep: GrowthReport[] } | null;
  tac: Tactic;
}

export const state: AppState = {
  career: null, game: null, tab: 'home', menu: 'bat', sel: null, open: null, report: null, tac: 'none',
};

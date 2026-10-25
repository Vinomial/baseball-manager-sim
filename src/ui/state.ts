import type { GrowthReport, MenuKey } from '../growth/training';
import type { Career, Game, GameKind } from '../types';

export type Tab = 'home' | 'game' | 'team' | 'table' | 'gm' | 'rec';
export type Screen = 'title' | 'new' | 'play';
export type TeamSub = 'power' | 'players' | 'order' | 'staff';

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
  /** 入団したばかりで,育成方針をこれから決める選手(ID) */
  planQueue: number[];
  /** トレードの組み立て中の内容 */
  trade: { teamId: number | null; want: number | null; give: number[] };
  /** 進む前の確認(疲れがたまっているときなど) */
  warn: string | null;
  /** セーブに失敗したか,容量が大きいか */
  saveFail: boolean;
  saveSize: number;
  /** 長い処理の進み具合(年末まで進める,など) */
  busy: { done: number; total: number; cancel: boolean; title: string } | null;
  /** 優勝などの演出を出したシーズン */
  celebrated: number;
  /** 説明を開いている用語.'*' なら用語集 */
  term: string | null;
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
  autoOpen: AutoOpen;
  /** 試合のない週に練習試合を組むか */
  practice: boolean;
}

const AUTO_KEY = 'baseball-manager-sim/autoOpen';
export type AutoOpen = 'all' | 'important' | 'off';
function readAutoOpen(): AutoOpen {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    return v === 'all' || v === 'off' ? v : 'important';
  } catch { return 'important'; }
}
export function writeAutoOpen(v: AutoOpen): void {
  try { localStorage.setItem(AUTO_KEY, v); } catch { /* 保存できなくても動く */ }
}

export const state: AppState = {
  career: null, last: null, screen: 'title', menuOpen: false, detail: null, planQueue: [], trade: { teamId: null, want: null, give: [] }, warn: null, saveFail: false, saveSize: 0, busy: null, celebrated: 0, term: null, tab: 'home', sub: 'power', folds: {}, menu: 'bat', menuTouched: false, sel: null, open: null, viewLevel: null, viewTeam: null, faRole: '野手',
  autoOpen: readAutoOpen(),
  practice: false,
};

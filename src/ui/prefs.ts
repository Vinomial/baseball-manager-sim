/** 見た目の設定(端末ごとに保存).文字サイズ,テーマ,はじめてガイド. */
export type FontSize = 's' | 'm' | 'l';
export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'baseball-manager-sim/prefs';

export interface Prefs { font: FontSize; theme: Theme; /** ガイドの進み具合 */ tut: number; /** ガイドを出すか */ tutOn: boolean; }

function load(): Prefs {
  const d: Prefs = { font: 'm', theme: 'auto', tut: 0, tutOn: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      font: p.font === 's' || p.font === 'l' ? p.font : 'm',
      theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'auto',
      tut: typeof p.tut === 'number' ? p.tut : 0,
      tutOn: p.tutOn !== false,
    };
  } catch { return d; }
}

export const prefs: Prefs = load();

export function savePrefs(): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* 保存できなくても動く */ }
}

export const FONT_SCALE: Record<FontSize, number> = { s: 0.92, m: 1, l: 1.15 };

/** 設定を画面に反映する */
export function applyPrefs(): void {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  r.style.setProperty('--fs', String(FONT_SCALE[prefs.font]));
  if (prefs.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', prefs.theme);
}

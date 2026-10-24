import { SAVE_VERSION } from './league/season';
import type { Career } from './types';

const SAVE_KEY = 'baseball-manager-sim/save';

export function saveCareer(c: Career): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(c)); } catch { /* 容量不足などは無視 */ }
}

export function loadCareer(): Career | null {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return null;
    const c = JSON.parse(s) as Career;
    // 将来セーブ形式を変えたら,ここで古いバージョンを変換する
    if (c.version !== SAVE_VERSION) return null;
    return c;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* 無視 */ }
}

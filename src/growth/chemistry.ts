import type { Team } from '../types';
import { clamp } from '../util/random';

/** 連携.2人の選手の組み合わせごとに 0〜100 の値を持つ. */
export const chemKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function getChem(t: Team, a: number, b: number): number {
  return t.chem[chemKey(a, b)] ?? t.baseChem;
}

export function addChem(t: Team, a: number, b: number, n: number): void {
  t.chem[chemKey(a, b)] = clamp(getChem(t, a, b) + n, 0, 100);
}

export function chemWord(v: number): string {
  return v >= 80 ? '抜群' : v >= 55 ? '深い' : v >= 30 ? '普通' : v >= 12 ? '浅い' : 'なし';
}

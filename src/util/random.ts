/**
 * 乱数.ゲームロジックは必ずここを経由する.
 * テストでは setRandom(seeded(n)) で再現可能な乱数に差し替える.
 */
let rng: () => number = Math.random;

export function setRandom(f: () => number): void { rng = f; }
export function resetRandom(): void { rng = Math.random; }

/** シード付き乱数(mulberry32) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (): number => rng();
export const ri = (a: number, b: number): number => a + Math.floor(rand() * (b - a + 1));
export const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** 平均0,標準偏差およそ1の近似正規乱数 */
export const randn = (): number => (rand() + rand() + rand() + rand() - 2) * 1.7;
export function shuffle<T>(a: readonly T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

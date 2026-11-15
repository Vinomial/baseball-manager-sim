/** 年末の選手権の決まり(DOM にもゲームの進行にも依存しない). */
import type { Career, CupKind } from '../types';

/** 大会の決まり.階層のまとまりごとに 3 つの大会が同時に行われる. */
export interface CupDef { kind: CupKind; name: string; short: string; tiers: number[]; }
export const CUPS: CupDef[] = [
  { kind: 'ama', name: '全日本アマチュア選手権', short: 'アマ選手権', tiers: [0, 1, 2] },
  { kind: 'jp', name: '日本選手権', short: '日本選手権', tiers: [3, 4] },
  { kind: 'world', name: 'ワールドチャンピオンシップ', short: 'ワールド', tiers: [5] },
];
export const cupDef = (kind: CupKind | undefined): CupDef => CUPS.find((d) => d.kind === kind) ?? CUPS[0];
export const cupOfTier = (tier: number): CupDef => CUPS.find((d) => d.tiers.includes(tier)) ?? CUPS[0];
/** プレイヤーが出る(出た)選手権 */
export const userCupDef = (c: Career): CupDef => (c.cup?.kind ? cupDef(c.cup.kind) : cupOfTier(c.level));

/** 残りのチーム数から,回戦の名前 */
export function roundName(slots: number, round: number): string {
  return slots <= 2 ? '決勝' : slots <= 4 ? '準決勝' : slots <= 8 ? '準々決勝' : `${round + 1}回戦`;
}

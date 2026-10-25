/** 選手ごとの育成方針.選んだタイプに向けて,練習の伸びが偏る. */
import type { AttrKey, PlanKey, Player } from '../types';

export interface PlanDef { key: PlanKey; name: string; desc: string; role: '野手' | '投手' | '両方'; up: AttrKey[]; }

export const PLANS: PlanDef[] = [
  { key: 'balance', name: 'バランス型', desc: '偏らせず,全体を伸ばす', role: '両方', up: [] },
  { key: 'slugger', name: '長距離砲型', desc: 'パワーとミートを重点的に.走力はやや後回し', role: '野手', up: ['power', 'meet'] },
  { key: 'contact', name: '巧打型', desc: 'ミートと走力を重点的に', role: '野手', up: ['meet', 'speed'] },
  { key: 'speedster', name: '俊足型', desc: '走力と守備を重点的に', role: '野手', up: ['speed', 'field'] },
  { key: 'guardian', name: '守備職人型', desc: '守備を大きく伸ばす', role: '野手', up: ['field'] },
  { key: 'ace', name: 'エース型', desc: '球威と制球を重点的に', role: '投手', up: ['velo', 'ctrl'] },
  { key: 'control', name: '技巧派型', desc: '制球とスタミナを重点的に', role: '投手', up: ['ctrl', 'stam'] },
  { key: 'iron', name: '鉄腕型', desc: 'スタミナと球威を重点的に', role: '投手', up: ['stam', 'velo'] },
];

export const planOf = (p: Player): PlanKey => p.plan ?? 'balance';
export const planDef = (k: PlanKey): PlanDef => PLANS.find((x) => x.key === k)!;
export const plansFor = (p: Player): PlanDef[] => PLANS.filter((x) => x.role === '両方' || x.role === p.role);

/** 方針による,能力ごとの練習の伸びの倍率.重点は 1.25 倍,それ以外は 0.92 倍. */
export function planMult(p: Player, k: AttrKey): number {
  const d = planDef(planOf(p));
  if (!d.up.length) return 1;
  return d.up.includes(k) ? 1.25 : 0.92;
}

/** いまの能力に合う方針のおすすめ */
export function suggestPlan(p: Player): PlanKey {
  const cands = plansFor(p).filter((x) => x.up.length);
  const score = (d: PlanDef) => d.up.reduce((s, k) => s + p[k], 0) / d.up.length;
  return cands.reduce((a, b) => (score(b) > score(a) ? b : a)).key;
}

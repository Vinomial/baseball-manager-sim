import type { AttrKey, Team } from '../types';
import { addChem } from './chemistry';
import { condDrift, growAttr, keysOf } from './player';
import { findByPos } from '../league/team';

export type MenuKey = 'bat' | 'run' | 'field' | 'pitch' | 'stam' | 'mix' | 'rest';

export interface Menu {
  name: string;
  desc: string;
  /** 重点的に伸びる能力と,その倍率 */
  focus: Partial<Record<AttrKey, number>>;
  /** 重点以外の能力の倍率(省略時は BASE_GAIN) */
  base?: number;
  chem?: 'field' | 'pitch';
  rest?: boolean;
}

/** どの練習でも,重点以外の能力がこの倍率で少し伸びる. */
export const BASE_GAIN = 0.35;

export const MENUS: Record<MenuKey, Menu> = {
  bat: { name: '打撃練習', desc: 'ミートとパワーが重点的に伸びる(野手)', focus: { meet: 1.7, power: 1.7 } },
  run: { name: '走塁練習', desc: '走力が重点的に伸びる(野手).盗塁・進塁が増える', focus: { speed: 2.8 } },
  field: { name: '守備練習', desc: '守備が重点的に伸び,二遊間の連携も深まる(野手)', focus: { field: 2.8 }, chem: 'field' },
  pitch: { name: '投球練習', desc: '球威と制球が重点的に伸び,バッテリーの連携も深まる(投手)', focus: { velo: 1.7, ctrl: 1.7 }, chem: 'pitch' },
  stam: { name: '走り込み', desc: 'スタミナが重点的に伸び,走力も少し伸びる(投手・野手)', focus: { stam: 2.8, speed: 1.2 } },
  mix: { name: 'バランス', desc: '全員の全能力がまんべんなく伸びる', focus: {}, base: 0.9 },
  rest: { name: '休養', desc: '伸びは小さいが,調子が上がり疲れが取れる', focus: {}, base: 0.12, rest: true },
};

/** 重点の能力名(表示用) */
export const focusKeys = (m: Menu): AttrKey[] => Object.keys(m.focus) as AttrKey[];

export interface GrowthReport { name: string; ups: [AttrKey, number][]; }

/** 1週間分の練習を行い,表示上の能力が上がった選手の一覧を返す. */
/** @param scale 試合数が多いリーグほど1週あたりの練習量を減らすための係数
 * @param condBias 調子の上がりやすさ(監督の信頼度で変わる) */
export function doTraining(t: Team, menu: MenuKey, scale = 1, condBias = 0): GrowthReport[] {
  const m = MENUS[menu];
  const rep: GrowthReport[] = [];
  for (const p of t.players) {
    const keys = keysOf(p);
    const before = Object.fromEntries(keys.map((k) => [k, Math.round(p[k])])) as Record<AttrKey, number>;
    for (const k of keys) growAttr(p, k, (m.focus[k] ?? m.base ?? BASE_GAIN) * scale);
    condDrift(p, (m.rest ? 1 : 0) + condBias);
    if (m.rest) p.fatigue = Math.max(0, p.fatigue - 40);
    const ups = keys.map((k) => [k, Math.round(p[k]) - before[k]] as [AttrKey, number]).filter((x) => x[1] > 0);
    if (ups.length) rep.push({ name: p.name, ups });
  }
  if (m.chem === 'field') {
    const a = findByPos(t, '二'), b = findByPos(t, '遊');
    if (a && b) addChem(t, a.id, b.id, 3);
  }
  if (m.chem === 'pitch') {
    const c = findByPos(t, '捕');
    if (c) for (const id of t.pitchers) addChem(t, c.id, id, 2);
  }
  return rep;
}

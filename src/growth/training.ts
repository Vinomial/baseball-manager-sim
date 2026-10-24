import type { AttrKey, Team } from '../types';
import { addChem } from './chemistry';
import { condDrift, growAttr, keysOf } from './player';
import { findByPos } from '../league/team';

export type MenuKey = 'bat' | 'run' | 'field' | 'pitch' | 'stam' | 'mix' | 'rest';

export interface Menu {
  name: string;
  desc: string;
  gain: Partial<Record<AttrKey, number>>;
  chem?: 'field' | 'pitch';
  rest?: boolean;
}

export const MENUS: Record<MenuKey, Menu> = {
  bat: { name: '打撃練習', desc: '野手のミートとパワーが伸びる', gain: { meet: 1, power: 1 } },
  run: { name: '走塁練習', desc: '野手の走力が伸びる.盗塁が決まりやすくなる', gain: { speed: 1.4 } },
  field: { name: '守備練習', desc: '野手の守備が伸び,二遊間の連携も深まる', gain: { field: 1.3 }, chem: 'field' },
  pitch: { name: '投球練習', desc: '投手の球威と制球が伸び,バッテリーの連携も深まる', gain: { velo: 1, ctrl: 1 }, chem: 'pitch' },
  stam: { name: '走り込み', desc: '投手のスタミナと野手の走力が伸びる', gain: { stam: 1.3, speed: 0.5 } },
  mix: { name: 'バランス', desc: '全員の全能力が少しずつ伸びる', gain: { meet: 0.45, power: 0.45, speed: 0.45, field: 0.45, velo: 0.45, ctrl: 0.45, stam: 0.45 } },
  rest: { name: '休養', desc: '能力は伸びないが,調子が上がり疲れが取れる', gain: {}, rest: true },
};

export interface GrowthReport { name: string; ups: [AttrKey, number][]; }

/** 1週間分の練習を行い,表示上の能力が上がった選手の一覧を返す. */
export function doTraining(t: Team, menu: MenuKey): GrowthReport[] {
  const m = MENUS[menu];
  const rep: GrowthReport[] = [];
  for (const p of t.players) {
    const keys = keysOf(p);
    const before = Object.fromEntries(keys.map((k) => [k, Math.round(p[k])])) as Record<AttrKey, number>;
    for (const [k, mult] of Object.entries(m.gain) as [AttrKey, number][]) {
      if (keys.includes(k)) growAttr(p, k, mult);
    }
    condDrift(p, m.rest ? 1 : 0);
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

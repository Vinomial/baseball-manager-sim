/** おすすめ料理.いまの練習・疲れ・調子・食材の相場から,作れる料理を点数で並べる. */
import type { AttrKey, Career, Ingredient } from '../types';
import { canCook, RECIPES, seasonalIng, type Recipe } from './meals';
import { MENUS, type MenuKey } from './training';
import { ALL_KEYS, LABEL } from '../data/constants';

export interface MealTip { recipe: Recipe; score: number; reason: string; }

/** いま行っている(直近の)練習メニュー */
function currentMenu(c: Career): MenuKey {
  const m = c.lastMenus[c.lastMenus.length - 1] as MenuKey | undefined;
  if (m && MENUS[m]) return m;
  return c.auto.train === 'fixed' ? (c.auto.fixed as MenuKey) : 'mix';
}

/** 作れる料理に点をつけて,高い順に返す. */
export function adviseMeals(c: Career): MealTip[] {
  const u = c.teams.find((t) => t.user)!;
  const menu = MENUS[currentMenu(c)];
  const tired = u.players.reduce((s, p) => s + p.fatigue, 0) / Math.max(1, u.players.length);
  const lowCond = u.players.filter((p) => p.cond <= 1).length / Math.max(1, u.players.length);
  const season = seasonalIng(c.cal);
  const out: MealTip[] = [];
  for (const r of RECIPES) {
    if (!canCook(c, r)) continue;
    // 重点の能力でどれだけ伸びるか
    let gain = 0, best: AttrKey = 'meet', bv = 0;
    for (const k of ALL_KEYS) {
      const w = menu.focus[k] ?? menu.base ?? 0.35;
      const m = r.mult[k] ?? r.mult.all ?? 1;
      gain += w * (m - 1);
      if (w * (m - 1) > bv) { bv = w * (m - 1); best = k; }
    }
    let score = gain * r.weeks;
    const notes: string[] = [];
    if (menu.rest) { score = (r.recover ?? 0) * 0.2 + (r.cond ?? 0) * 3; }
    if (r.recover && tired > 40) { score += r.recover * 0.18; notes.push('疲れがたまっているので回復も狙えます'); }
    if (r.cond && lowCond > 0.25) { score += r.cond * 3; notes.push('調子の悪い選手が多いので上げられます'); }
    if (r.need[season]) { score *= 1.15; notes.push('旬の食材で効き目が大きい'); }
    // 食材を使うほど惜しい(数の多い材料に比べ,少ない材料を使うと不利)
    const cost = (Object.entries(r.need) as [Ingredient, number][]).reduce((s, [k, n]) => s + n * c.market[k], 0);
    score -= cost * 0.25;
    if (r.kind === '特別' || r.kind === '勝負めし') score -= 0.3;
    const lead = bv > 0.3 ? `${menu.name}の重点(${LABEL[best]})が大きく伸びます` : `${menu.name}の週に全体を底上げします`;
    out.push({ recipe: r, score, reason: [lead, ...notes].join(' / ') });
  }
  return out.sort((a, b) => b.score - a.score);
}

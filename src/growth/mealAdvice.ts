/** おすすめ料理.チームの疲れ・調子・やる気・怪我人と,食材の相場から,作れる料理を点数で並べる. */
import type { Career, Ingredient } from '../types';
import { canCook, mealEffect, RECIPES, seasonalIng, type Recipe } from './meals';
import { isHurt } from '../league/health';

export interface MealTip { recipe: Recipe; score: number; reason: string; }

/** 作れる料理に点をつけて,高い順に返す. */
export function adviseMeals(c: Career): MealTip[] {
  const u = c.teams.find((t) => t.user)!;
  const n = Math.max(1, u.players.length);
  const tired = u.players.reduce((s, p) => s + p.fatigue, 0) / n;
  const lowCond = u.players.filter((p) => p.cond <= 1).length / n;
  const lowMorale = u.players.filter((p) => p.morale < 40).length / n;
  const hurt = u.players.filter(isHurt).length;
  const season = seasonalIng(c.cal);
  const out: MealTip[] = [];
  for (const r of RECIPES) {
    if (!canCook(c, r)) continue;
    const e = mealEffect(c, r);
    const notes: string[] = [];
    // しばらく続く効き目は,いま効いている料理より強いときだけ価値がある
    const cur = c.meal;
    let score = 0;
    if (e.weeks) {
      const rest = Math.max(0, e.rest - (cur?.rest ?? 0)), guard = Math.max(0, (cur?.guard ?? 1) - e.guard), lift = Math.max(0, e.lift - (cur?.lift ?? 0));
      score += e.weeks * (rest * (tired > 35 ? 0.35 : 0.15) + guard * (hurt ? 6 : 4) + lift * (lowCond > 0.2 ? 3 : 1.5));
      if (rest && tired > 35) notes.push('疲れがたまりがちなので,毎週の回復が助かります');
      if (guard && hurt) notes.push(`怪我人が${hurt}人いるので,これ以上増やさないように`);
      if (lift && lowCond > 0.2) notes.push('調子の悪い選手が多いので,上がりやすくします');
    }
    if (e.recover) { score += e.recover * (tired > 40 ? 0.25 : 0.06); if (tired > 40) notes.push('疲れがたまっているので,すぐ回復できます'); }
    if (e.cond) { score += e.cond * (lowCond > 0.25 ? 4 : 1.5); if (lowCond > 0.25) notes.push('調子をすぐ上げられます'); }
    if (e.morale) { score += e.morale * (lowMorale > 0.2 ? 0.8 : 0.2); if (lowMorale > 0.2) notes.push('やる気の低い選手が多いので,上げられます'); }
    if (r.need[season]) notes.push('旬の食材で効き目が大きい');
    // 食材を使うほど惜しい
    const cost = (Object.entries(r.need) as [Ingredient, number][]).reduce((s, [k, m]) => s + m * c.market[k], 0);
    score -= cost * 1.2;
    out.push({ recipe: r, score, reason: notes.length ? notes.join(' / ') : 'いまのチームの状態を整えます' });
  }
  return out.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}

import { canCook, INGREDIENTS, RECIPES, RECIPE_KINDS, recipeNeedText, SEASON_NAME, seasonalIng, ingName } from '../../growth/meals';
import { adviseMeals } from '../../growth/mealAdvice';
import { ingredientPrice } from '../../league/economy';
import { fmtYen } from '../../league/finance';
import { rewardText } from '../../league/missions';
import type { Career } from '../../types';
import { esc } from '../../util/format';

/** ミッションと台所.食材を集めて料理を作ると,練習の伸びが大きくなる. */
export function missionsHTML(c: Career): string {
  return `<div class="plist">${c.missions.map((m) =>
    `<div class="pl"><div class="top"><span class="nm">${esc(m.title)}</span><span class="small muted">報酬 ${esc(rewardText(m.reward, m))}</span></div>
    <div class="chem"><span class="bar"><i style="width:${Math.min(100, (m.progress / m.target) * 100)}%"></i></span><span class="small">${m.progress}/${m.target}</span></div></div>`).join('')}</div>`;
}

export function kitchenSummary(c: Career): string {
  return c.meal ? `${c.meal.name} あと${c.meal.weeks}週` : `食材 ${Object.values(c.pantry).reduce((a, b) => a + b, 0)}個`;
}

export function kitchenHTML(c: Career): string {
  const meal = c.meal;
  const tips = adviseMeals(c);
  const pantry = INGREDIENTS.map((i) => `<span class="ing ${c.pantry[i.key] ? '' : 'none'}"><b>${i.name}</b>×${c.pantry[i.key]}</span>`).join('');
  const sell = INGREDIENTS.map((i) => {
    const pr = ingredientPrice(c, i.key), mk = c.market[i.key];
    return `<div class="sell"><span><b>${i.name}</b> <span class="small ${mk >= 1.1 ? 'up' : mk <= 0.9 ? 'dn' : 'muted'}">${fmtYen(pr)}${mk >= 1.1 ? '↑' : mk <= 0.9 ? '↓' : ''}</span></span><button class="btn ghost" data-a="sell" data-k="${i.key}" data-i="1" ${c.pantry[i.key] ? '' : 'disabled'}>1個売る</button><button class="btn ghost" data-a="sell" data-k="${i.key}" data-i="99" ${c.pantry[i.key] ? '' : 'disabled'}>全部</button></div>`;
  }).join('');
  return `<div class="kitchen">
  ${meal ? `<p class="meal-on"><span class="rec star">効果中</span> <b>${esc(meal.name)}</b> <span class="small">あと${meal.weeks}週 / ${esc(meal.desc)}</span></p>` : '<p class="small muted" style="margin:0 0 6px">いま効いている料理はありません.ミッションや試合で食材を集めて,料理を作りましょう.</p>'}
  <div class="pantry">${pantry}</div>
  <h3>食材を売る <span class="small muted">相場は毎週動きます</span></h3><div class="sells">${sell}</div>
  <p class="small muted" style="margin:6px 0 0">${SEASON_NAME(c.cal)}の旬は<b>${ingName(seasonalIng(c.cal))}</b>.旬の食材を使うと効き目が1割5分大きくなります.</p>
  ${tips.length ? `<h3>おすすめ料理</h3><div class="plist">${tips.slice(0, 2).map((t, i) => `<div class="pl star"><div class="top"><span class="nm"><span class="rec star">${i ? 'ほかの候補' : '★おすすめ'}</span>${esc(t.recipe.name)}</span><button class="btn" data-a="cook" data-k="${t.recipe.key}">作る</button></div><span class="small muted">${esc(t.reason)}</span></div>`).join('')}</div>` : ''}
  <h3>料理を作る <span class="small muted">${RECIPES.filter((r) => canCook(c, r)).length}品 作れます</span></h3>
  ${RECIPE_KINDS.map((kind) => `<h4 style="margin:8px 0 2px" class="small muted">${kind}</h4><div class="plist">${RECIPES.filter((r) => r.kind === kind).map((r) => {
    const ok = canCook(c, r);
    return `<div class="pl ${ok ? 'star' : ''}"><div class="top"><span class="nm">${esc(r.name)}${r.need[seasonalIng(c.cal)] ? '<span class="tag">旬</span>' : ''}</span><button class="btn ${ok ? '' : 'ghost'}" data-a="cook" data-k="${r.key}" ${ok ? '' : 'disabled'}>作る</button></div>
    <span class="small">材料: ${esc(recipeNeedText(r))}</span><br><span class="small muted">${esc(r.desc)}${r.cond ? '(調子も上がる)' : ''}</span></div>`;
  }).join('')}</div>`).join('')}</div>`;
}

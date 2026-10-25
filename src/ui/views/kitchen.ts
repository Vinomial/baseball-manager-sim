import { canCook, INGREDIENTS, RECIPES, recipeNeedText } from '../../growth/meals';
import { rewardText } from '../../league/missions';
import type { Career } from '../../types';
import { esc } from '../../util/format';

/** ミッションと台所.食材を集めて料理を作ると,練習の伸びが大きくなる. */
export function renderKitchen(c: Career): string {
  const meal = c.meal;
  const pantry = INGREDIENTS.map((i) => `<span class="ing ${c.pantry[i.key] ? '' : 'none'}"><b>${i.name}</b>×${c.pantry[i.key]}</span>`).join('');
  return `<h2>ミッション</h2><div class="plist">${c.missions.map((m) =>
    `<div class="pl"><div class="top"><span class="nm">${esc(m.title)}</span><span class="small muted">報酬 ${esc(rewardText(m.reward))}</span></div>
    <div class="chem"><span class="bar"><i style="width:${Math.min(100, (m.progress / m.target) * 100)}%"></i></span><span class="small">${m.progress}/${m.target}</span></div></div>`).join('')}</div>
  <h2>台所</h2><div class="card kitchen">
  ${meal ? `<p class="meal-on"><span class="rec star">効果中</span> <b>${esc(meal.name)}</b> <span class="small">あと${meal.weeks}試合 / ${esc(meal.desc)}</span></p>` : '<p class="small muted" style="margin:0 0 6px">いま効いている料理はありません.ミッションや試合で食材を集めて,料理を作りましょう.</p>'}
  <div class="pantry">${pantry}</div>
  <details style="margin-top:8px"><summary><b>料理を作る</b> <span class="small muted">${RECIPES.filter((r) => canCook(c, r)).length}品 作れます</span></summary>
  <div class="plist" style="margin-top:6px">${RECIPES.map((r) => {
    const ok = canCook(c, r);
    return `<div class="pl ${ok ? 'star' : ''}"><div class="top"><span class="nm">${esc(r.name)}</span><button class="btn ${ok ? '' : 'ghost'}" data-a="cook" data-k="${r.key}" ${ok ? '' : 'disabled'}>作る</button></div>
    <span class="small">材料: ${esc(recipeNeedText(r))}</span><br><span class="small muted">${esc(r.desc)}</span></div>`;
  }).join('')}</div></details></div>`;
}

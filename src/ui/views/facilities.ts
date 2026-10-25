import { FACILITIES, MAX_FAC, upgradeCost, weeklyIncome } from '../../league/economy';
import { fmtYen } from '../../league/finance';
import type { Career } from '../../types';
import { esc } from '../../util/format';

export function facilitiesSummary(c: Career): string {
  return `資金 ${fmtYen(c.funds)}`;
}

/** 資金と施設.お金を使って,チームを長い目で強くする. */
export function facilitiesHTML(c: Career): string {
  return `<div class="chem"><span class="who">資金 ${fmtYen(c.funds)}</span><span class="small muted">1週の収入の目安 ${fmtYen(weeklyIncome(c))}</span></div>
  <p class="small muted" style="margin:4px 0 8px">入場収入と,食材の売却で増えます.施設を強くすると,練習,怪我,料理,ドラフトに長く効きます.</p>
  <div class="plist">${FACILITIES.map((f) => {
    const lv = c.fac[f.key], max = lv >= MAX_FAC, cost = upgradeCost(c, f.key);
    return `<div class="pl"><div class="top"><span class="nm">${f.name} <span class="tag">Lv${lv}</span></span>
    <button class="btn ${max ? 'ghost' : ''}" data-a="upgrade" data-k="${f.key}" ${max || c.funds < cost ? 'disabled' : ''}>${max ? '最大' : `強化 ${fmtYen(cost)}`}</button></div>
    <span class="small">${esc(f.desc(lv))}</span>${max ? '' : `<br><span class="small muted">次のレベル: ${esc(f.desc(lv + 1))}</span>`}</div>`;
  }).join('')}</div>`;
}

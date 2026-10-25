import { EXPENSE_KINDS, INCOME_KINDS, ledgerRow } from '../../league/economy';
import { fmtYen } from '../../league/finance';
import type { Career } from '../../types';

const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);

export function ledgerSummary(c: Career): string {
  const r = ledgerRow(c);
  const d = sum(r.income) - sum(r.expense);
  return `今年 ${d >= 0 ? '+' : ''}${fmtYen(Math.round(d))}`;
}

function bars(title: string, kinds: Record<string, string>, data: Record<string, number>, cls: string): string {
  const total = sum(data) || 1;
  const rows = Object.entries(kinds).filter(([k]) => data[k]).sort((a, b) => data[b[0]] - data[a[0]]);
  return `<h3>${title} <span class="small muted">${fmtYen(Math.round(sum(data)))}</span></h3>${rows.length ? rows.map(([k, n]) => `<div class="chem"><span class="who">${n}</span><span class="bar"><i class="${cls}" style="width:${(data[k] / total) * 100}%"></i></span><span class="small">${fmtYen(Math.round(data[k]))}</span></div>`).join('') : '<p class="small muted" style="margin:0">まだありません.</p>'}`;
}

/** 収支.お金がどこから入って,何に使ったかを見せる. */
export function ledgerHTML(c: Career): string {
  const r = ledgerRow(c);
  const past = c.ledger.filter((x) => x.season !== c.season).slice(-5).reverse();
  return `<p class="small muted" style="margin:0">第${c.season}季の収支です.収入と支出の内訳を見て,お金の使い道を考えましょう.</p>
  ${bars('収入', INCOME_KINDS, r.income, '')}${bars('支出', EXPENSE_KINDS, r.expense, 'neg')}
  ${past.length ? `<h3>過去の収支</h3><table class="results"><tbody>${past.map((x) => { const d = sum(x.income) - sum(x.expense); return `<tr><td>第${x.season}季</td><td class="num">収入 ${fmtYen(Math.round(sum(x.income)))}</td><td class="num">支出 ${fmtYen(Math.round(sum(x.expense)))}</td><td class="num ${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : ''}${fmtYen(Math.round(d))}</td></tr>`; }).join('')}</tbody></table>` : ''}`;
}

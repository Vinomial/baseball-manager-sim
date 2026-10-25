import { forecast, trustBudgetFactor, trustGrowth, trustLabel, winProb } from '../../league/finance';
import { userTeam } from '../../league/season';
import type { Career, Team } from '../../types';
import { term } from '../glossary';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** 今週の予想勝率. */
export function winProbHTML(c: Career, opp: Team): string {
  const p = winProb(userTeam(c), opp);
  return `<div class="prob" role="img" aria-label="予想勝率 ${pct(p)}"><span class="small">${term('prob')}</span><span class="bar"><i style="width:${p * 100}%;${p < 0.5 ? 'background:var(--bad)' : ''}"></i></span><b>${pct(p)}</b></div>`;
}

export function trustSummary(c: Career): string {
  return `${Math.round(c.trust)}(${trustLabel(c.trust)})`;
}

/** 監督の信頼度 */
export function trustHTML(c: Career): string {
  const t = c.trust;
  return `<div class="chem"><span class="who">信頼度 ${Math.round(t)}</span><span class="bar"><i style="width:${t}%;${t < 30 ? 'background:var(--bad)' : ''}"></i></span><span>${trustLabel(t)}</span></div>
  <p class="small muted" style="margin:6px 0 0">高いほど,練習の伸び(いま ×${trustGrowth(t).toFixed(2)}),調子,予算(×${trustBudgetFactor(t).toFixed(2)}),自由契約の入団に良い影響があります.勝つと思われていた試合に勝つほど上がり,0になると解任されます.${t < 30 ? '<b style="color:var(--bad)"> 解任の危機です!</b>' : ''}</p>`;
}

export function forecastSummary(c: Career): string {
  const f = forecast(c, 120);
  return `${f.upN ? `昇格圏 ${pct(f.up)}` : 'プレーオフ ' + pct(f.playoff)}${f.downN ? ` / 降格圏 ${pct(f.down)}` : ''}`;
}

/** シーズンの予想 */
export function forecastHTML(c: Career): string {
  const f = forecast(c);
  const rows = [...(f.upN ? [[`昇格圏(上位${f.upN})`, f.up]] : []), ['プレーオフ(上位4)', f.playoff], ...(f.downN ? [['降格圏', f.down]] : [])] as [string, number][];
  return `<p class="small" style="margin:0 0 6px">予想の最終勝数 <b>${f.wins.toFixed(1)}勝</b> / 予想順位 <b>${1 + f.rank.reduce((best, v, i, a) => (v > a[best] ? i : best), 0)}位</b>が最も多い見込み</p>
  ${rows.map(([n, v]) => `<div class="chem"><span class="who">${n}</span><span class="bar"><i style="width:${v * 100}%;${n === '降格圏' ? 'background:var(--bad)' : ''}"></i></span><span>${pct(v)}</span></div>`).join('')}`;
}

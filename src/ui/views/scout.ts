import { LABEL } from '../../data/constants';
import { keysOf } from '../../growth/player';
import { fmtYen } from '../../league/finance';
import { scoutCost, SCOUT_WEEKS } from '../../league/scouting';
import type { Career } from '../../types';
import { esc, grade } from '../../util/format';
import { abilitiesHTML } from '../components';

export function scoutSummary(c: Career): string {
  return c.scout ? `派遣中(あと${c.scout.weeks}週)` : `注目選手 ${c.watch.length}人`;
}

/** スカウトの派遣と,見つけた注目選手 */
export function scoutHTML(c: Career): string {
  const types = ['野手', '投手', '素質'] as const;
  return `<p class="small muted" style="margin:0 0 6px">スカウトを${SCOUT_WEEKS}週ほど派遣すると,注目選手を見つけてきます.見つけた選手は,次のドラフトで指名でき,能力の見積もりの幅も狭くなります.</p>
  <div class="row">${types.map((t) => `<button class="btn ghost" data-a="scout" data-k="${t}" ${c.scout ? 'disabled' : ''}>${t === '素質' ? '素質のある若手' : t + 'を探す'} ${fmtYen(scoutCost(c, t))}</button>`).join('')}</div>
  ${c.scout ? `<p class="small" style="margin:6px 0 0">🔎 スカウトが${c.scout.type}を探しています(あと${c.scout.weeks}週).</p>` : ''}
  ${c.watch.length ? `<div class="plist" style="margin-top:8px">${c.watch.map((p) => `<div class="pl"><div class="top"><span class="nm">${esc(p.name)}<span class="tag">${p.role}</span><span class="tag">${p.age}歳</span></span></div>
    <div class="attrs">${keysOf(p).map((k) => { const r = p.scout?.[k] ?? [p[k], p[k]]; return `<label>${LABEL[k]}</label><span class="g g${grade(r[0])}">${grade(r[0])}</span>〜<span class="g g${grade(r[1])}">${grade(r[1])}</span><span class="gv"></span>`; }).join('')}</div>${abilitiesHTML(p)}</div>`).join('')}</div>` : ''}`;
}

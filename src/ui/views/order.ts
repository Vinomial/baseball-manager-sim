import { ALL_POS, POS_NAME } from '../../data/constants';
import { chemWord, getChem } from '../../growth/chemistry';
import { userTeam } from '../../league/season';
import { fielders, findByPos, fit, getPlayer } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { attrsHTML, condHTML } from '../components';
import { state } from '../state';

export function renderOrder(c: Career): string {
  const u = userTeam(c), sel = state.sel;
  const inL = new Set(u.lineup.map((e) => e.pid));
  const bench = fielders(u).filter((p) => !inL.has(p.id));

  let h = `<p class="small muted">打順の選手を2人タップすると入れ替わります.控えの選手をタップすると,選んでいる打順の選手と交代します.守備位置は右のメニューで変えられます.試合は自動で進むので,試合前にここで準備します.</p>`;

  h += `<h2>打順</h2><div class="card"><table class="order"><tbody>
  ${u.lineup.map((e, i) => {
    const p = getPlayer(u, e.pid), f = fit(p, e.pos);
    return `<tr class="${sel?.t === 'l' && sel.i === i ? 'sel' : ''}">
    <td class="num">${i + 1}</td>
    <td><button class="pick" data-a="selL" data-i="${i}"><b>${esc(p.name)}</b> <span class="tag">本職 ${POS_NAME[p.pos]}</span> ${condHTML(p)}${f < 0 ? ` <span class="fitbad">守備${f}</span>` : ''}${attrsHTML(p)}</button></td>
    <td><select data-a="pos" data-i="${i}" aria-label="${esc(p.name)}の守備位置">${ALL_POS.map((x) => `<option ${x === e.pos ? 'selected' : ''} value="${x}">${POS_NAME[x]}</option>`).join('')}</select></td></tr>`;
  }).join('')}
  </tbody></table></div>
  <h2>控え野手</h2><div class="plist">${bench.length
    ? bench.map((p) => `<button class="pl ${sel?.t === 'b' && sel.id === p.id ? 'sel' : ''}" data-a="selB" data-id="${p.id}"><div class="top"><span class="nm">${esc(p.name)}<span class="tag">${POS_NAME[p.pos]}</span></span>${condHTML(p)}</div>${attrsHTML(p)}</button>`).join('')
    : '<p class="muted small">控えはいません.</p>'}</div>
  <h2>投手陣</h2><p class="small muted">上の3人が先発ローテーション,残りが中継ぎです.2人タップで入れ替わります.</p><div class="plist">
  ${u.pitchers.map((id, i) => {
    const p = getPlayer(u, id);
    return `<button class="pl ${sel?.t === 'p' && sel.i === i ? 'sel' : ''}" data-a="selP" data-i="${i}"><div class="top"><span class="nm">${i < 3 ? '先発' + (i + 1) : '中継ぎ'} ${esc(p.name)}</span><span class="small">${condHTML(p)} 疲労${Math.round(p.fatigue)}</span></div>${attrsHTML(p)}</button>`;
  }).join('')}</div>
  <div class="row" style="margin-top:10px"><button class="btn ghost" data-a="auto">おまかせで組む</button></div>`;

  const cat = findByPos(u, '捕'), a = findByPos(u, '二'), b = findByPos(u, '遊');
  const bar = (lbl: string, v: number) => `<div class="chem"><span class="who">${lbl}</span><span class="bar"><i style="width:${v}%"></i></span><span>${chemWord(v)}</span></div>`;
  h += `<h2>連携</h2><div class="card"><p class="small muted">一緒に試合に出たり,守備練習・投球練習をすると深まります.バッテリーの連携は制球に,二遊間の連携は守備と併殺に効きます.</p>`;
  if (cat) h += `<h3>バッテリー(捕手 ${esc(cat.name)})</h3>${u.pitchers.map((id) => bar(esc(getPlayer(u, id).name), getChem(u, cat.id, id))).join('')}`;
  if (a && b) h += `<h3>二遊間</h3>${bar(esc(a.name) + ' / ' + esc(b.name), getChem(u, a.id, b.id))}`;
  return h + `</div>`;
}

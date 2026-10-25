import { ALL_POS, POS_NAME } from '../../data/constants';
import { chemWord, getChem } from '../../growth/chemistry';
import { findCombos } from '../../league/combos';
import { userTeam } from '../../league/season';
import { fielders, findByPos, fit, getPlayer } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { avatar } from '../avatar';
import { convertTipsHTML } from './todo';
import { attrsHTML, condHTML, playerStars } from '../components';
import { state } from '../state';

export function renderOrder(c: Career): string {
  const u = userTeam(c), sel = state.sel;
  const inL = new Set(u.lineup.map((e) => e.pid));
  const bench = fielders(u).filter((p) => !inL.has(p.id));

  const modes: ['ability' | 'form' | 'develop', string, string][] = [['ability', '実力重視', '力の高い順に組む'], ['form', '調子重視', '調子・疲れ・怪我を見て組む'], ['develop', '育成重視', '若く伸びしろのある選手にも出番を']];
  const mg = c.staff.manager;
  let h = `<div class="card"><div class="row" style="justify-content:space-between"><b>オーダーの組み方</b><button class="btn ${c.auto.lineup ? '' : 'ghost'}" data-a="auto-lineup" aria-pressed="${c.auto.lineup}">${c.auto.lineup ? '✔ 監督におまかせ中' : '自分で組む(手動)'}</button></div>
  ${c.auto.lineup ? `<div class="seg" style="margin-top:6px" role="group" aria-label="おまかせの方針">${modes.map(([k, n]) => `<button class="btn ghost" data-a="auto-mode" data-k="${k}" aria-pressed="${c.auto.mode === k}">${n}</button>`).join('')}</div><p class="small muted" style="margin:4px 0 0">${modes.find((m) => m[0] === c.auto.mode)![2]}.毎週のはじめに,オーダーとローテーションを組み直します.${mg ? `監督(${esc(mg.name)})の腕前で,組み方が変わります.` : '監督を雇うと,組み方が正確になります(スタッフ).'}</p>` : '<p class="small muted" style="margin:4px 0 0">オンにすると,毎週のはじめに,監督がオーダーとローテーションを組み直します.</p>'}</div>
  <p class="small muted">打順の選手を2人タップすると入れ替わります.控えの選手をタップすると,選んでいる打順の選手と交代します.守備位置は右のメニューで変えられます.試合は自動で進むので,試合前にここで準備します.</p>`;

  h += `<h2>打順</h2><div class="card"><table class="order"><tbody>
  ${u.lineup.map((e, i) => {
    const p = getPlayer(u, e.pid), f = fit(p, e.pos);
    return `<tr class="${sel?.t === 'l' && sel.i === i ? 'sel' : ''}">
    <td class="num">${i + 1}</td>
    <td><button class="mini ghost" data-a="detail" data-id="${p.id}" aria-label="${esc(p.name)}の詳細" style="float:right">📊</button><button class="pick" data-a="selL" data-i="${i}">${avatar(p, 30)} <b>${esc(p.name)}</b> <span class="tag">本職 ${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span> ${condHTML(p)}${f < 0 ? ` <span class="fitbad">守備${f}</span>` : ''}<div>${playerStars(p)}</div>${attrsHTML(p)}</button></td>
    <td><select data-a="pos" data-i="${i}" aria-label="${esc(p.name)}の守備位置">${ALL_POS.map((x) => `<option ${x === e.pos ? 'selected' : ''} value="${x}">${POS_NAME[x]}</option>`).join('')}</select></td></tr>`;
  }).join('')}
  </tbody></table></div>
  <h2>控え野手</h2><div class="plist">${bench.length
    ? bench.map((p) => `<button class="pl ${sel?.t === 'b' && sel.id === p.id ? 'sel' : ''}" data-a="selB" data-id="${p.id}"><div class="top"><span class="nm">${esc(p.name)}<span class="tag">${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span></span>${condHTML(p)}</div><div>${playerStars(p)}</div>${attrsHTML(p)}</button>`).join('')
    : '<p class="muted small">控えはいません.</p>'}</div>
  <h2>投手陣</h2><p class="small muted">上の3人が先発ローテーション,残りが中継ぎです.2人タップで入れ替わります.</p><div class="plist">
  ${u.pitchers.map((id, i) => {
    const p = getPlayer(u, id);
    return `<button class="pl ${sel?.t === 'p' && sel.i === i ? 'sel' : ''}" data-a="selP" data-i="${i}"><div class="top"><span class="nm">${i < 3 ? '先発' + (i + 1) : '中継ぎ'} ${esc(p.name)}<span class="tag">${p.age}歳</span></span><span class="small">${condHTML(p)} 疲労${Math.round(p.fatigue)}</span></div><div>${playerStars(p)}</div>${attrsHTML(p)}</button>`;
  }).join('')}</div>
  <div class="row" style="margin-top:10px"><button class="btn ghost" data-a="auto">おまかせで組む</button></div>`;

  h += convertTipsHTML(c, 'コンバートのおすすめ');
  const combos = findCombos(u);
  const cat = findByPos(u, '捕'), a = findByPos(u, '二'), b = findByPos(u, '遊');
  const bar = (lbl: string, v: number) => `<div class="chem"><span class="who">${lbl}</span><span class="bar"><i style="width:${v}%"></i></span><span>${chemWord(v)}</span></div>`;
  h += `<h2>連携</h2><div class="card"><p class="small muted">一緒に試合に出たり,守備練習・投球練習をすると深まります.バッテリーの連携は制球に,二遊間の連携は守備と併殺に効きます.</p>`;
  if (cat) h += `<h3>バッテリー(捕手 ${esc(cat.name)})</h3>${u.pitchers.map((id) => bar(esc(getPlayer(u, id).name), getChem(u, cat.id, id))).join('')}`;
  if (a && b) h += `<h3>二遊間</h3>${bar(esc(a.name) + ' / ' + esc(b.name), getChem(u, a.id, b.id))}`;
  h += `</div><h2>コンボ</h2><p class="small muted">条件がそろうと,試合で小さな追い風になります.オーダーを入れ替えて,そろえてみましょう.</p><div class="plist">${combos.map((cb) => `<div class="pl ${cb.active ? 'star' : ''}"><div class="top"><span class="nm">${cb.active ? '<span class="rec star">発動中</span>' : ''}${esc(cb.name)}</span></div><span class="small">${esc(cb.need)}</span><br><span class="small ${cb.active ? 'up' : 'muted'}">${esc(cb.effect)}</span></div>`).join('')}</div>`;
  return h;
}

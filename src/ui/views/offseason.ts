import { DRAFT_ROUNDS, LABEL, LEAGUES, POS_NAME, ROSTER_MAX } from '../../data/constants';
import { advise } from '../../league/advice';
import { canStartSeason, userTeam } from '../../league/season';
import { fielders, pitchersOf } from '../../league/team';
import { faAppeal, faVerdict } from '../../league/world';
import { keysOf } from '../../growth/player';
import type { Career, Player } from '../../types';
import { esc, grade } from '../../util/format';
import { attrsHTML } from '../components';
import { state } from '../state';

const tagHTML = (tags: string[]) => tags.map((t) => `<span class="rec">${esc(t)}</span>`).join('');

function resultHTML(c: Career): string {
  const o = c.off!;
  const mv = o.move > 0 ? `${LEAGUES[o.to].name}へ昇格!` : o.move < 0 ? `${LEAGUES[o.to].name}へ降格...` : `${LEAGUES[o.from].name}に残留.`;
  return `<h2>シーズン${c.season} 終了</h2>
  <div class="card"><div class="result px">${o.rank}位 ${o.rec.w}勝${o.rec.l}敗${o.rec.d}分</div>
  <p style="text-align:center;margin:0"><b>${mv}</b></p><p class="small" style="text-align:center;margin:4px 0">${esc(o.playoff)}</p>
  ${o.retired.length ? `<p class="small">引退: ${o.retired.map(esc).join(',')}</p>` : '<p class="small muted">今オフの引退選手はいません.</p>'}
  <p class="small muted">全選手が1歳年をとりました.ピークを過ぎた選手は能力が少し落ちています.他のリーグの結果は「順位」タブで見られます.</p></div>`;
}

function draftHTML(c: Career): string {
  const o = c.off!, d = o.draft, u = userTeam(c);
  const mine = d.picks.filter((p) => p.user);
  const log = d.picks.length
    ? `<details class="card"><summary><b>これまでの指名</b> <span class="small muted">${d.picks.length}人</span></summary><ol class="small" style="margin:6px 0 0;padding-left:1.4em">${d.picks.map((p) => `<li class="${p.user ? 'up' : ''}">${esc(p.team)}: ${esc(p.name)}</li>`).join('')}</ol></details>` : '';
  if (d.done) {
    return `<h2>ドラフト会議</h2><div class="card"><p class="small">${mine.length ? `指名した選手: ${mine.map((p) => esc(p.name)).join(',')}` : '今年は指名しませんでした.'}</p></div>${log}`;
  }
  const perRound = d.order.length / DRAFT_ROUNDS;
  const round = Math.floor(d.idx / perRound) + 1, nth = (d.idx % perRound) + 1;
  const adv = advise(u, d.pool);
  const list = [...d.pool].map((p, i) => ({ p, i, a: adv.get(p.id)! })).sort((x, y) => y.a.score - x.a.score);
  return `<h2>ドラフト会議</h2><p class="small muted">${round}巡目の${nth}番目,あなたの指名です(全${DRAFT_ROUNDS}巡).能力は幅でしか分かりません.「おすすめ」は今のチームの弱点と見積もりから出しています.</p>
  <div class="plist">${list.map(({ p, i, a }) => `<div class="pl ${a.star ? 'star' : ''}"><div class="top"><span class="nm">${a.star ? '<span class="rec star">★おすすめ</span>' : ''}${esc(p.name)}<span class="tag">${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span></span>
    <button class="btn" data-a="draft" data-i="${i}">指名する</button></div>${tagHTML(a.tags)} <span class="small muted">${esc(a.reason)}</span>
    <div class="attrs">${keysOf(p).map((k) => { const r = p.scout?.[k] ?? [p[k], p[k]]; return `<label>${LABEL[k]}</label><span class="g g${grade(r[0])}">${grade(r[0])}</span>〜<span class="g g${grade(r[1])}">${grade(r[1])}</span><span class="gv"></span>`; }).join('')}
    ${p.scoutPot ? `<label>素質</label><span class="g g${grade(p.scoutPot[0])}">${grade(p.scoutPot[0])}</span>〜<span class="g g${grade(p.scoutPot[1])}">${grade(p.scoutPot[1])}</span>` : ''}</div></div>`).join('')}</div>
  <div class="row" style="margin-top:8px"><button class="btn ghost" data-a="draft" data-i="-1">この順番は見送る</button></div>${log}`;
}

function faHTML(c: Career): string {
  const u = userTeam(c);
  const pool = c.fa.filter((p) => p.role === state.faRole);
  const adv = advise(u, c.fa.filter((p) => faVerdict(c, p) === 'ok'));
  const rows = [...pool].sort((a, b) => ((adv.get(b.id)?.score ?? -1) - (adv.get(a.id)?.score ?? -1)) || (b.meet + b.velo) - (a.meet + a.velo));
  const full = u.players.length >= ROSTER_MAX;
  const card = (p: Player) => {
    const ok = faVerdict(c, p) === 'ok', a = adv.get(p.id);
    return `<div class="pl ${a?.star ? 'star' : ''}"><div class="top"><span class="nm">${a?.star ? '<span class="rec star">★おすすめ</span>' : ''}${esc(p.name)}<span class="tag">${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span>${p.prev ? `<span class="tag">${esc(p.prev)}</span>` : ''}</span>
    <button class="btn" data-a="sign" data-id="${p.id}" ${ok && !full ? '' : 'disabled'}>${ok ? '獲得する' : '来てくれない'}</button></div>
    ${a ? `${tagHTML(a.tags)} <span class="small muted">${esc(a.reason)}</span>` : '<span class="small muted">今のチームでは入団を断られそうです(より強いチーム,上のリーグなら来てくれます)</span>'}${attrsHTML(p)}</div>`;
  };
  return `<h2>自由契約(戦力外・未指名)</h2><p class="small muted">他チームから戦力外になった選手や,ドラフトで指名されなかった選手です.チームが強く,リーグが上ほど来てくれます(今のチームの魅力 ${Math.round(faAppeal(c))}).登録は${ROSTER_MAX}人までです.</p>
  <div class="lgtabs"><button data-a="faRole" data-k="野手" aria-pressed="${state.faRole === '野手'}">野手 ${c.fa.filter((p) => p.role === '野手').length}</button><button data-a="faRole" data-k="投手" aria-pressed="${state.faRole === '投手'}">投手 ${c.fa.filter((p) => p.role === '投手').length}</button></div>
  <div class="plist">${rows.length ? rows.slice(0, 24).map(card).join('') : '<p class="small muted">いまは自由契約の選手がいません.</p>'}</div>`;
}

export function renderOff(c: Career): string {
  const o = c.off!, u = userTeam(c), n = u.players.length;
  return `${resultHTML(c)}${draftHTML(c)}${o.draft.done ? faHTML(c) : ''}
  <h2>新シーズンの準備</h2><div class="card"><p class="small">登録人数 ${n}/${ROSTER_MAX}(野手${fielders(u).length},投手${pitchersOf(u).length}).選手の放出は「選手」タブから行えます.</p>
  ${o.released.length ? `<p class="small muted">放出: ${o.released.map(esc).join(',')}</p>` : ''}${o.signed.length ? `<p class="small muted">獲得: ${o.signed.map(esc).join(',')}</p>` : ''}
  ${n > ROSTER_MAX ? `<p class="small" style="color:var(--bad)">登録上限を超えています.${n - ROSTER_MAX}人放出してください.</p>` : ''}
  ${!o.draft.done ? '<p class="small muted">ドラフトが終わると,自由契約の選手を獲得できます.</p>' : ''}
  <button class="btn" data-a="season" ${canStartSeason(c) ? '' : 'disabled'}>シーズン${c.season + 1}を始める</button></div>`;
}


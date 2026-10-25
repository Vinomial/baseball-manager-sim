import { avatar } from '../avatar';
import { fmtYen } from '../../league/finance';
import { helperSalary, tradeOpen, tradeOthers, tradeRatio, tradeValue } from '../../league/trade';
import { userTeam } from '../../league/season';
import { findPlayer, fielders, pitchersOf } from '../../league/team';
import type { Career, Player } from '../../types';
import { esc } from '../../util/format';
import { abilitiesHTML, playerStars } from '../components';
import { state } from '../state';

export function tradeSummary(c: Career): string {
  return tradeOpen(c) ? '相談できます' : '期限が過ぎました';
}

const row = (p: Player, btn: string): string => `<div class="pl"><div class="top"><span class="nm">${avatar(p, 28)} ${esc(p.name)}<span class="tag">${p.role}</span><span class="tag">${p.age}歳</span><span class="tag">${fmtYen(p.salary)}</span></span>${btn}</div><div>${playerStars(p)}</div>${abilitiesHTML(p)}</div>`;

/** トレード.相手のほしい選手を選び,出す選手を選んで,提案する. */
export function tradeHTML(c: Career): string {
  if (!tradeOpen(c)) return '<p class="small muted" style="margin:0">トレードは9月前まで,またはオフシーズンに行えます.</p>';
  const u = userTeam(c), t = state.trade;
  const others = tradeOthers(c);
  let h = `<p class="small muted" style="margin:0 0 6px">他チームの選手がほしいときは,こちらの選手と交換できます.出す選手の価値(将来性込み)が,ほしい選手より高いと受け入れてくれます.</p>
  <div class="chips">${others.map((o) => `<button class="chip" data-a="trade-team" data-id="${o.id}" aria-pressed="${t.teamId === o.id}">${esc(o.name)}</button>`).join('')}</div>`;
  const o = others.find((x) => x.id === t.teamId);
  if (!o) return h + '<p class="small muted">相手のチームを選んでください.</p>';
  const want = t.want !== null ? findPlayer(o, t.want) : undefined;
  if (!want) {
    const top = [...o.players].sort((a, b) => tradeValue(b) - tradeValue(a)).slice(0, 8);
    return `${h}<h3>ほしい選手を選ぶ</h3><div class="plist">${top.map((p) => row(p, `<button class="btn ghost" data-a="trade-want" data-id="${p.id}">ほしい</button>`)).join('')}</div>`;
  }
  const give = t.give.map((id) => findPlayer(u, id)).filter((p): p is Player => !!p);
  const ratio = tradeRatio(give, want);
  const ok = ratio >= 1.05;
  h += `<h3>ほしい選手</h3>${row(want, `<button class="btn ghost" data-a="trade-want" data-id="-1">変える</button>`)}
  <h3>こちらから出す選手 <span class="small muted">(${give.length}人)</span></h3>
  <div class="chem"><span class="who">相手の評価</span><span class="bar"><i class="${ok ? '' : 'neg'}" style="width:${Math.min(100, ratio * 100 / 1.05 * 0.95)}%"></i></span><span class="small ${ok ? 'up' : 'dn'}">${ok ? '受け入れそう' : 'まだ足りない'}</span></div>
  <div class="plist">${[...u.players].sort((a, b) => tradeValue(a) - tradeValue(b)).map((p) => row(p, `<button class="btn ${t.give.includes(p.id) ? '' : 'ghost'}" data-a="trade-give" data-id="${p.id}" aria-pressed="${t.give.includes(p.id)}">${t.give.includes(p.id) ? '✔ 出す' : '出す'}</button>`)).join('')}</div>
  <div class="row" style="margin-top:8px"><button class="btn" data-a="trade-do" ${give.length ? '' : 'disabled'}>この条件でトレードする</button></div>
  <p class="small muted" style="margin:6px 0 0">野手${fielders(u).length}人・投手${pitchersOf(u).length}人(それぞれ最低10人・5人は必要)</p>`;
  return h;
}

/** 助っ人.上のリーグの選手を 1 シーズンだけ借りる. */
export function helpersHTML(c: Career): string {
  const u = userTeam(c);
  const mine = u.players.filter((p) => p.loan !== undefined);
  let h = `<p class="small muted" style="margin:0 0 6px">上のリーグの,経験豊富な選手を1シーズンだけ借りられます.力のわりに年俸は高めです.契約が終わると去りますが,延長もできます.</p>`;
  if (mine.length) h += `<h3>いま借りている助っ人</h3><div class="plist">${mine.map((p) => row(p, `<button class="btn ghost" data-a="helper-ext" data-id="${p.id}">1年延長(${fmtYen(Math.round(p.salary * 0.5))})</button>`)).join('')}</div>`;
  h += `<h3>候補</h3><div class="plist">${c.helpers.map((p) => row(p, `<button class="btn" data-a="helper-hire" data-id="${p.id}">雇う(契約金 ${fmtYen(Math.round(helperSalary(p) * 0.5))})</button>`)).join('') || '<p class="small muted">候補はいません.</p>'}</div>`;
  return h;
}

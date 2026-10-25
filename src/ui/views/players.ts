import { POS_NAME } from '../../data/constants';
import { roomWord } from '../../growth/player';
import { budgetFor, fmtYen, payroll } from '../../league/finance';
import { userRosterMax, userTeam } from '../../league/season';
import { fielders, findPlayer } from '../../league/team';
import type { Career, Player, Team } from '../../types';
import { esc, fmtAvg, fmtEra } from '../../util/format';
import { attrsHTML, condHTML, playerDetail } from '../components';
import { term } from '../glossary';
import { state } from '../state';

/** 選手の 1 枚のカード.タップで通算成績が開く. */
export function playerCard(c: Career, p: Player, canRelease: boolean): string {
  const open = state.open === p.id, s = p.stats;
  const st = p.role === '野手'
    ? `${s.g}試合 打率${fmtAvg(s.h, s.ab)} ${s.hr}本 ${s.rbi}打点 ${s.sb}盗塁`
    : `${s.g}登板 ${s.w}勝${s.l}敗 防御率${fmtEra(s.r, s.outs)} ${s.k}奪三振`;
  return `<div class="pl"><button class="pick plain" data-a="open" data-id="${p.id}" aria-expanded="${open}">
    <div class="top"><span class="nm">${esc(p.name)}<span class="tag">${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span><span class="tag">${fmtYen(p.salary)}</span></span>${condHTML(p)}</div>${attrsHTML(p)}
    <div class="small muted">${c.phase === 'season' ? `今季 ${st}` : '今季の成績は「通算成績」で見られます'}</div></button>
    <button class="btn ghost" data-a="detail" data-id="${p.id}" style="margin-top:6px">📊 能力の詳細・通算成績</button>
    ${open ? `${playerDetail(p, c.phase === 'season', roomWord(p))}${canRelease ? `<div style="margin-top:6px"><button class="btn danger" data-a="release" data-id="${p.id}">放出する(自由契約)</button></div>` : ''}` : ''}</div>`;
}

export function rosterHTML(c: Career, t: Team, canRelease: boolean): string {
  const ps = t.pitchers.map((id) => findPlayer(t, id)).filter((p): p is Player => !!p);
  return `<h2>野手</h2><div class="plist">${fielders(t).map((p) => playerCard(c, p, canRelease)).join('')}</div>
  <h2>投手</h2><div class="plist">${ps.map((p) => playerCard(c, p, canRelease)).join('')}</div>`;
}

export function renderPlayers(c: Career): string {
  const u = userTeam(c);
  const pay = payroll(u), bud = budgetFor(c);
  return `<div class="card"><div class="chem"><span class="who">年俸総額 ${fmtYen(pay)}</span><span class="bar"><i style="width:${Math.min(100, (pay / bud) * 100)}%;${pay > bud ? 'background:var(--bad)' : ''}"></i></span><span class="small">予算 ${fmtYen(bud)}</span></div><p class="small muted" style="margin:4px 0 0">登録 ${u.players.length}/${userRosterMax(c)}人.${term('budget')}は同じリーグの他チームの平均と,監督の信頼度で決まります.</p></div><p class="small muted">選手をタップすると,成長タイプ,伸びしろ,通算成績が見られます.${c.phase === 'off' ? '放出した選手は自由契約になります.' : ''}</p>${rosterHTML(c, u, c.phase === 'off')}`;
}

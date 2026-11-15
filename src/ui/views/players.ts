import { POS_NAME } from '../../data/constants';
import { roomWord } from '../../growth/player';
import { budgetFor, fmtYen, payroll } from '../../league/finance';
import { userRosterMax, userTeam } from '../../league/season';
import { activePlayers, FARM_MAX, fielders, findPlayer, isFarm } from '../../league/team';
import type { Career, Player, Team } from '../../types';
import { esc, fmtAvg, fmtEra } from '../../util/format';
import { PERS } from '../../growth/personality';
import { leavingRisk } from '../../league/contracts';
import { avatar } from '../avatar';
import { attrsHTML, condHTML, playerDetail, playerStars } from '../components';
import { term } from '../glossary';
import { state } from '../state';
import { cardSVG, rarityOf } from '../card';
import { teamColors } from '../emblem';

/** 選手の 1 枚のカード.タップで通算成績が開く. */
export function playerCard(c: Career, p: Player, canRelease: boolean, t?: Team): string {
  const open = state.open === p.id, s = p.stats;
  const farmBtn = t?.user ? (isFarm(t, p)
    ? `<button class="btn ghost" data-a="unfarm" data-id="${p.id}">⬆ 一軍に上げる</button>`
    : `<button class="btn ghost" data-a="farm" data-id="${p.id}">⬇ 二軍へ</button>`) : '';
  const st = p.role === '野手'
    ? `${s.g}試合 打率${fmtAvg(s.h, s.ab)} ${s.hr}本 ${s.rbi}打点 ${s.sb}盗塁`
    : `${s.g}登板 ${s.w}勝${s.l}敗 防御率${fmtEra(s.r, s.outs)} ${s.k}奪三振`;
  const rar = rarityOf(p);
  return `<div class="pl rar-${rar}"><button class="pick plain" data-a="open" data-id="${p.id}" aria-expanded="${open}">
    <div class="top"><span class="nm">${avatar(p, 32)} ${esc(p.name)}${rar >= 2 ? `<span class="rarity r${rar}">${['', '', 'RARE', 'EPIC', 'LEGEND'][rar]}</span>` : ''}<span class="tag">${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span>${p.seasons.length === 0 && p.age <= 23 ? '<span class="tag newbie">新人</span>' : ''}<span class="tag">${PERS[p.pers].name}</span>${p.morale < 35 ? '<span class="tag" style="color:var(--bad)">不満</span>' : ''}${leavingRisk(p) ? '<span class="tag" style="color:var(--bad)">退団の恐れ</span>' : ''}${p.loan !== undefined ? '<span class="tag">助っ人</span>' : ''}${(p.years ?? 1) > 1 ? `<span class="tag">${p.years}年契約</span>` : ''}<span class="tag">${fmtYen(p.salary)}</span></span>${condHTML(p)}</div><div style="margin:2px 0">${playerStars(p)}</div>${attrsHTML(p)}
    <div class="small muted">${c.phase === 'season' ? `今季 ${st}` : '今季の成績は「通算成績」で見られます'}</div></button>
    <div class="row" style="margin-top:6px"><button class="btn ghost" data-a="detail" data-id="${p.id}">📊 能力の詳細・通算成績</button>${farmBtn}</div>
    ${open ? `${playerDetail(p, c.phase === 'season', roomWord(p))}${canRelease ? `<div style="margin-top:6px"><button class="btn danger" data-a="release" data-id="${p.id}">放出する(自由契約)</button></div>` : ''}` : ''}</div>`;
}

export function rosterHTML(c: Career, t: Team, canRelease: boolean): string {
  const ps = t.pitchers.map((id) => findPlayer(t, id)).filter((p): p is Player => !!p);
  const farm = t.players.filter((p) => isFarm(t, p));
  return `<h2>野手</h2><div class="plist">${fielders(t).map((p) => playerCard(c, p, canRelease, t)).join('')}</div>
  <h2>投手</h2><div class="plist">${ps.map((p) => playerCard(c, p, canRelease, t)).join('')}</div>
  ${t.user ? `<h2>二軍 <span class="small muted">${farm.length}/${FARM_MAX}人</span></h2>
  <p class="small muted" style="margin:0 0 6px">二軍の選手は一軍の登録人数に数えず,公式戦には出ません.毎週,二軍の試合で経験を積みます(一軍の試合に出るほどは伸びません).若手を抱えておくのに使えます.</p>
  ${farm.length ? `<div class="plist">${farm.map((p) => playerCard(c, p, canRelease, t)).join('')}</div>` : '<p class="small muted">いまは二軍の選手はいません.</p>'}` : ''}`;
}

/** カードの一覧.タップで詳細が開く. */
export function cardGridHTML(t: Team): string {
  const [jersey] = teamColors(t);
  const ps = [...fielders(t), ...t.pitchers.map((id) => findPlayer(t, id)).filter((p): p is Player => !!p)];
  return `<div class="cards">${ps.map((p) => `<button class="cardbtn plain" data-a="detail" data-id="${p.id}" aria-label="${esc(p.name)}の詳細">${cardSVG(p, { jersey })}</button>`).join('')}</div>`;
}

export function renderPlayers(c: Career): string {
  const u = userTeam(c);
  const pay = payroll(u), bud = budgetFor(c);
  return `<div class="card"><div class="chem"><span class="who">年俸総額 ${fmtYen(pay)}</span><span class="bar"><i style="width:${Math.min(100, (pay / bud) * 100)}%;${pay > bud ? 'background:var(--bad)' : ''}"></i></span><span class="small">予算 ${fmtYen(bud)}</span></div><p class="small muted" style="margin:4px 0 0">一軍 ${activePlayers(u).length}/${userRosterMax(c)}人${u.farm?.length ? ` / 二軍 ${u.farm.length}人` : ''}.${term('budget')}は同じリーグの他チームの平均と,GMの信頼度で決まります.</p></div><p class="small muted">選手をタップすると,成長タイプ,伸びしろ,通算成績が見られます.${c.phase === 'off' ? '放出した選手は自由契約になります.' : ''}</p>
  <div class="row"><button class="btn ghost" data-a="cards" aria-pressed="${state.cards}">${state.cards ? '📋 リストで見る' : '🃏 カードで見る'}</button></div>
  ${state.cards ? cardGridHTML(u) : rosterHTML(c, u, c.phase === 'off')}`;
}

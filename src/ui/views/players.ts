import { POS_NAME } from '../../data/constants';
import { roomWord } from '../../growth/player';
import { userTeam } from '../../league/season';
import { fielders, findPlayer } from '../../league/team';
import type { Career, Player } from '../../types';
import { esc, fmtAvg, fmtEra } from '../../util/format';
import { attrsHTML, condHTML } from '../components';
import { state } from '../state';

export function renderPlayers(c: Career): string {
  const u = userTeam(c), off = c.phase === 'off';
  const card = (p: Player) => {
    const open = state.open === p.id, s = p.stats;
    const st = p.role === '野手'
      ? `${s.g}試合 打率${fmtAvg(s.h, s.ab)} ${s.hr}本 ${s.rbi}打点 ${s.sb}盗塁`
      : `${s.g}登板 ${s.w}勝${s.l}敗 防御率${fmtEra(s.r, s.outs)} ${s.k}奪三振 疲労${Math.round(p.fatigue)}`;
    return `<div class="pl"><button class="pick" data-a="open" data-id="${p.id}" aria-expanded="${open}" style="background:none;border:0;padding:0;width:100%;text-align:left">
      <div class="top"><span class="nm">${esc(p.name)}<span class="tag">${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span></span>${condHTML(p)}</div>${attrsHTML(p)}</button>
      ${open ? `<div class="detail">成長タイプ: ${p.type} / 伸びしろ: ${roomWord(p)}<br>${st}
      ${off ? `<div style="margin-top:6px"><button class="btn danger" data-a="release" data-id="${p.id}">放出する</button></div>` : ''}</div>` : ''}</div>`;
  };
  const ps = u.pitchers.map((id) => findPlayer(u, id)).filter((p): p is Player => !!p);
  return `<p class="small muted">選手をタップすると成長タイプと成績が見られます.</p>
  <h2>野手</h2><div class="plist">${fielders(u).map(card).join('')}</div>
  <h2>投手</h2><div class="plist">${ps.map(card).join('')}</div>`;
}

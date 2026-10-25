import { LEAGUES } from '../../data/constants';
import { leaders } from '../../league/leaders';
import { standings, teamById } from '../../league/schedule';
import { ovr } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { gradeHTML } from '../components';
import { state } from '../state';
import { rosterHTML } from './players';

/** 順位タブ.どのリーグの順位,個人成績,優勝の歴史も見られる. */
export function renderTable(c: Career): string {
  const level = state.viewLevel ?? c.level;
  const lg = c.leagues[level];
  const L = LEAGUES[level];
  const tabs = `<div class="lgtabs" role="group" aria-label="リーグ">${LEAGUES.map((x, i) =>
    `<button data-a="lv" data-i="${i}" aria-pressed="${i === level}">${x.name.replace('リーグ', '')}${i === c.level ? ' ★' : ''}</button>`).join('')}</div>`;
  const moveNote = `${level < LEAGUES.length - 1 ? '上位2チームは昇格.' : ''}${level > 0 ? '下位2チームは降格.' : ''}上位4チームはプレーオフに進みます.`;
  const tbl = standings(c, level);
  let h = `${tabs}<h2>${L.name} 順位表 <span class="small muted">(${lg.week}/${lg.schedule.length}試合)</span></h2><p class="small muted">${moveNote}</p>
  <div class="card scroll"><table class="std"><thead><tr><th>順位</th><th>チーム</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>得失点</th><th>戦力</th></tr></thead><tbody>
  ${tbl.map((r, i) => `<tr class="${r.t.user ? 'me' : ''}"><td>${i + 1}</td><td><button class="linkish" data-a="vteam" data-id="${r.t.id}">${esc(r.t.name)}</button></td><td>${r.w + r.l + r.d}</td><td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td>${r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3) : '---'}</td><td>${r.rf - r.ra > 0 ? '+' : ''}${r.rf - r.ra}</td><td>${gradeHTML(ovr(r.t))}</td></tr>`).join('')}
  </tbody></table></div>`;

  if (state.viewTeam !== null && lg.teamIds.includes(state.viewTeam)) {
    const t = teamById(c, state.viewTeam);
    h += `<h2>${esc(t.name)} の選手 <button class="btn ghost" data-a="vteam" data-id="-1">閉じる</button></h2>${rosterHTML(c, t, false)}`;
  } else {
    h += `<p class="small muted">チーム名をタップすると,選手と通算成績が見られます.</p>`;
  }

  h += `<h2>個人成績 <span class="small muted">(${L.name})</span></h2><div class="boards">${leaders(c, level).map((b) =>
    `<div class="board2"><h4>${b.name}</h4>${b.rows.length ? `<ol>${b.rows.map((r) => `<li><span>${esc(r.p.name)} <span class="muted">${esc(r.team.slice(0, 4))}</span></span><b>${r.text}</b></li>`).join('')}</ol>` : '<span class="small muted">まだありません</span>'}</div>`).join('')}</div>`;

  const champs = c.champs.filter((x) => x.level === level).slice().reverse().slice(0, 12);
  h += `<h2>歴代の優勝 <span class="small muted">(${L.name})</span></h2><div class="card">${champs.length
    ? `<table class="results"><tbody>${champs.map((x) => `<tr><td>第${x.season}季</td><td class="${x.teamId === c.userId ? 'w' : ''}">${esc(x.team)}</td><td class="muted small">準優勝 ${esc(x.runnerUp)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="small muted">まだ優勝チームはありません.</p>'}</div>`;
  return h;
}

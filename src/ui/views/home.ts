import { LEAGUES } from '../../data/constants';
import { recap } from '../../engine/recap';
import { MENUS } from '../../growth/training';
import { userMatch, userTeam } from '../../league/season';
import { ovr } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { gradeHTML } from '../components';
import { state } from '../state';
import { renderOff } from './offseason';
import { renderKitchen } from './kitchen';
import { renderTraining } from './training';
import { statusHTML, winProbHTML } from './status';

export function renderHome(c: Career): string {
  if (c.phase === 'off') return renderOff(c);
  const u = userTeam(c);
  const { home, opp } = userMatch(c);
  let h = '';
  if (c.last) h += `<div class="notice">${esc(c.last)}</div>`;
  for (const n of c.news) h += `<div class="news">★ ${esc(n)}</div>`;
  if (c.event) {
    h += `<div class="card event"><p style="margin:0"><span class="rec star">出来事</span> <b>${esc(c.event.title)}</b></p><p class="small" style="margin:6px 0">${esc(c.event.body)}</p><div class="row">${c.event.choices.map((x) => `<button class="btn ghost ev" data-a="event" data-k="${x.key}"><b>${esc(x.label)}</b><span class="small muted">${esc(x.hint)}</span></button>`).join('')}</div><p class="small muted" style="margin:6px 0 0">選ばずに試合へ進むと,出来事は過ぎ去ります.</p></div>`;
  }
  if (state.last && !state.autoOpen) {
    const r = recap(state.last.game);
    h += `<div class="card"><p style="margin:0"><b>前の試合</b> <span class="small muted">${esc(r.headline)}</span></p><button class="btn ghost" data-a="tab" data-k="game" style="margin-top:6px">詳しく見る</button></div>`;
  }
  const total = c.leagues[c.level].schedule.length, lg = LEAGUES[c.level];
  h += `<h2>第${c.week + 1}戦の相手 <span class="small muted">(全${total}戦 / ${lg.teams}チーム)</span></h2>
  <div class="card"><div class="row" style="justify-content:space-between">
    <div><b>${esc(opp.name)}</b>${opp.id === c.rival ? ' <span class="rec star">ライバル対決!</span>' : ''} <span class="muted small">(${home ? 'ホーム' : 'ビジター'})</span></div>
    <div class="small">相手の総合力 ${gradeHTML(ovr(opp))} 自チーム ${gradeHTML(ovr(u))}</div></div>${winProbHTML(c, opp)}</div>
  `;
  h += renderKitchen(c);
  h += renderTraining(c);
  h += `
  <div class="row" style="margin-top:14px"><button class="btn" data-a="start">${MENUS[state.menu].name}をして試合へ</button>
  <button class="btn ghost" data-a="auto-season">この練習でシーズン終了まで進める</button></div>
  <p class="small" style="margin:8px 0 0"><button class="btn ghost" data-a="autoopen" aria-pressed="${state.autoOpen}">試合後に結果を開く: ${state.autoOpen ? 'ON' : 'OFF(スキップ)'}</button></p>`;
  if (c.results.length) {
    h += `<h2>今シーズンの試合結果</h2><div class="card scroll"><table class="results"><tbody>${[...c.results].reverse().slice(0, 8).map((r) => {
      const k = r.us > r.them ? 'w' : r.us < r.them ? 'l' : '';
      return `<tr><td>第${r.week + 1}戦</td><td>${esc(r.opp)}<span class="tag">${r.home ? 'H' : 'A'}</span></td><td class="${k}">${r.us > r.them ? '勝' : r.us < r.them ? '負' : '分'}</td><td class="num">${r.us} - ${r.them}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  h += statusHTML(c);
  h += `<h2>データ</h2><div class="row"><button class="btn danger" data-a="reset">データを消して最初から</button></div>`;
  return h;
}

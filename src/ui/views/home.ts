import { LABEL, LEAGUES } from '../../data/constants';
import { focusKeys, MENUS, type MenuKey } from '../../growth/training';
import { userMatch, userTeam } from '../../league/season';
import { ovr } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { gradeHTML } from '../components';
import { state } from '../state';
import { renderOff } from './offseason';

export function renderHome(c: Career): string {
  if (c.phase === 'off') return renderOff(c);
  const u = userTeam(c);
  const { home, opp } = userMatch(c);
  let h = '';
  if (c.last) h += `<div class="notice">${esc(c.last)}</div>`;
  const total = c.leagues[c.level].schedule.length, lg = LEAGUES[c.level];
  h += `<h2>第${c.week + 1}戦の相手 <span class="small muted">(全${total}戦 / ${lg.teams}チーム)</span></h2>
  <div class="card"><div class="row" style="justify-content:space-between">
    <div><b>${esc(opp.name)}</b> <span class="muted small">(${home ? 'ホーム' : 'ビジター'})</span></div>
    <div class="small">相手の総合力 ${gradeHTML(ovr(opp))} 自チーム ${gradeHTML(ovr(u))}</div></div></div>
  <h2>今週の練習メニュー</h2><p class="small muted">選んだ練習の能力が重点的に伸び,それ以外の能力も少しずつ伸びます.試合は自動で進みます.</p>
  <div class="menus" role="group" aria-label="練習メニュー">
  ${(Object.entries(MENUS) as [MenuKey, (typeof MENUS)[MenuKey]][]).map(([k, m]) =>
    `<button class="menu" data-a="menu" data-k="${k}" aria-pressed="${state.menu === k}"><b>${m.name}</b>${focusKeys(m).length ? `<span><span class="focus">重点</span>${focusKeys(m).map((x) => LABEL[x]).join('・')}</span>` : ''}<span>${m.desc}</span></button>`).join('')}
  </div>
  <div class="row" style="margin-top:14px"><button class="btn" data-a="start">${MENUS[state.menu].name}をして試合へ</button>
  <button class="btn ghost" data-a="auto-season">この練習でシーズン終了まで進める</button></div>`;
  if (c.results.length) {
    h += `<h2>今シーズンの試合結果</h2><div class="card scroll"><table class="results"><tbody>${[...c.results].reverse().slice(0, 8).map((r) => {
      const k = r.us > r.them ? 'w' : r.us < r.them ? 'l' : '';
      return `<tr><td>第${r.week + 1}戦</td><td>${esc(r.opp)}<span class="tag">${r.home ? 'H' : 'A'}</span></td><td class="${k}">${r.us > r.them ? '勝' : r.us < r.them ? '負' : '分'}</td><td class="num">${r.us} - ${r.them}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  h += `<h2>データ</h2><div class="row"><button class="btn danger" data-a="reset">データを消して最初から</button></div>`;
  return h;
}

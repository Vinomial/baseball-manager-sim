import { LABEL } from '../../data/constants';
import { userSide } from '../../engine/game';
import { focusKeys, MENUS } from '../../growth/training';
import type { Side } from '../../types';
import { esc } from '../../util/format';
import { state } from '../state';

/** 直近の試合の結果.試合は自動で進むので,ここでは結果と経過を見る. */
export function renderGame(): string {
  const l = state.last;
  if (!l) return `<div class="card"><p>まだ試合をしていません.ホームで練習メニューを選ぶと,練習のあとに試合が行われます.</p><button class="btn" data-a="tab" data-k="home">ホームへ</button></div>`;
  const g = l.game, n = Math.max(9, g.inning);
  const row = (s: Side) => `<tr><td>${esc(s.team.name)}</td>${Array.from({ length: n }, (_, i) => {
    const v = s.inn[i];
    const x = s === g.home && i === g.inning - 1 && g.half === 0 ? 'x' : '';
    return `<td>${v == null ? x : v}</td>`;
  }).join('')}<td class="tot num">${s.runs}</td><td class="num">${s.hits}</td></tr>`;

  const us = userSide(g), them = us === g.home ? g.away : g.home;
  const res = us.runs > them.runs ? '勝利!' : us.runs < them.runs ? '敗戦' : '引き分け';
  const m = MENUS[l.menu];
  let h = `<div class="card"><div class="result px">${res} ${us.runs} - ${them.runs}</div>
  <div class="lines"><table><thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th class="tot">計</th><th>安</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div></div>`;

  h += `<details class="card" open><summary><b>今週の練習: ${m.name}</b> <span class="small muted">${l.report.length}人が成長</span></summary>
  <div class="small" style="margin-top:6px">${focusKeys(m).length ? `<span class="focus">重点</span>${focusKeys(m).map((k) => LABEL[k]).join('・')}(それ以外の能力も少し伸びます)<br>` : ''}${l.report.length
    ? l.report.map((x) => `${esc(x.name)}: ${x.ups.map(([k, v]) => `${LABEL[k]}<span class="up">+${v}</span>`).join(' ')}`).join('<br>')
    : '目に見える成長はありませんでした.'}</div></details>`;

  const hl = [...g.log].reverse().filter((e) => e.hl);
  h += `<h2>ハイライト</h2><div class="card"><ul class="log">${hl.map((e) => `<li><span class="t">${e.tag}</span><span class="hl">${esc(e.t)}</span></li>`).join('') || '<li class="muted">見どころの少ない試合でした.</li>'}</ul></div>
  <details class="card"><summary><b>全打席の経過</b></summary><ul class="log" style="max-height:none;margin-top:6px">${[...g.log].reverse().map((e) => `<li><span class="t">${e.tag}</span><span class="${e.hl ? 'hl' : ''}">${esc(e.t)}</span></li>`).join('')}</ul></details>`;
  return h;
}

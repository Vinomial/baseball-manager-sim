import { LABEL } from '../../data/constants';
import { userSide } from '../../engine/game';
import { boxScore, fmtIP, recap } from '../../engine/recap';
import { focusKeys, MENUS } from '../../growth/training';
import { POS_NAME } from '../../data/constants';
import type { Game, Side } from '../../types';
import { esc } from '../../util/format';
import { replayHTML } from '../replay';
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
  const rc = recap(g);
  let h = `<div class="card"><div class="result px">${res} ${us.runs} - ${them.runs}</div>
  <p class="headline">${esc(rc.headline)}</p>
  <div class="lines"><table><thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th class="tot">計</th><th>安</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div></div>`;

  if (rc.lines.length || rc.mvp) {
    h += `<div class="card"><h3 style="margin-top:0">戦評</h3><ul class="recap">${rc.lines.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>${rc.mvp
      ? `<p class="mvp"><span class="focus">殊勲</span><b>${esc(rc.mvp.name)}</b> <span class="small muted">${esc(rc.mvp.text)}</span></p>` : ''}</div>`;
  }
  h += replayHTML(g);
  h += `<details class="card" open><summary><b>今週の練習: ${m.name}</b> <span class="small muted">${l.report.length}人が成長</span></summary>
  <div class="small" style="margin-top:6px">${focusKeys(m).length ? `<span class="focus">重点</span>${focusKeys(m).map((k) => LABEL[k]).join('・')}(それ以外の能力も少し伸びます)<br>` : ''}${l.report.length
    ? l.report.map((x) => `${esc(x.name)}: ${x.ups.map(([k, v]) => `${LABEL[k]}<span class="up">+${v}</span>`).join(' ')}`).join('<br>')
    : '目に見える成長はありませんでした.'}</div></details>`;

  h += `<h2>ボックススコア</h2>${boxHTML(g, us)}${boxHTML(g, them)}`;
  const hl = [...g.log].reverse().filter((e) => e.hl);
  h += `<h2>ハイライト</h2><div class="card"><ul class="log">${hl.map((e) => `<li><span class="t">${e.tag}</span><span class="hl">${esc(e.t)}</span></li>`).join('') || '<li class="muted">見どころの少ない試合でした.</li>'}</ul></div>
  <details class="card"><summary><b>全打席の経過</b></summary><ul class="log" style="max-height:none;margin-top:6px">${[...g.log].reverse().map((e) => `<li><span class="t">${e.tag}</span><span class="${e.hl ? 'hl' : ''}">${esc(e.t)}</span></li>`).join('')}</ul></details>`;
  return h;
}

function boxHTML(g: Game, side: Side): string {
  const b = boxScore(g, side);
  const bat = b.bat.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.p.name)}<span class="tag">${x.pos === '指' ? '指' : POS_NAME[x.pos].slice(0, 1)}</span></td><td>${x.ab}</td><td>${x.h}</td><td>${x.rbi}</td><td>${x.hr}</td><td>${x.bb}</td><td>${x.so}</td><td>${x.sb}</td></tr>`).join('');
  const pit = b.pit.map((x) => `<tr><td>${esc(x.p.name)}${x.note ? `<span class="tag">${x.note}</span>` : ''}</td><td>${fmtIP(x.outs)}</td><td>${x.ha}</td><td>${x.bba}</td><td>${x.k}</td><td>${x.r}</td></tr>`).join('');
  return `<details class="card" ${side.team.user ? 'open' : ''}><summary><b>${esc(side.team.name)}</b> <span class="small muted">${side.runs}点 ${side.hits}安打</span></summary>
  <div class="scroll"><table class="std box"><thead><tr><th>順</th><th>選手</th><th>打</th><th>安</th><th>点</th><th>本</th><th>四</th><th>三</th><th>盗</th></tr></thead><tbody>${bat}</tbody></table>
  <table class="std box"><thead><tr><th>投手</th><th>回</th><th>安</th><th>四</th><th>三振</th><th>失点</th></tr></thead><tbody>${pit}</tbody></table></div></details>`;
}

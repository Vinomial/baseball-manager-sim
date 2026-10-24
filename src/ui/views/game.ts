import { LABEL } from '../../data/constants';
import { canBunt, canSteal, defense, offense, pitchLimit, relievers, userSide } from '../../engine/game';
import { MENUS } from '../../growth/training';
import type { Side } from '../../types';
import { esc } from '../../util/format';
import { clamp } from '../../util/random';
import { attrsHTML, condHTML, fieldSVG, gradeBadge } from '../components';
import { state } from '../state';

export function renderGame(): string {
  const g = state.game;
  if (!g) return `<div class="card"><p>今週の試合はまだです.ホームで練習メニューを選ぶと試合が始まります.</p><button class="btn" data-a="tab" data-k="home">ホームへ</button></div>`;
  const n = Math.max(9, g.inning), off = offense(g), def = defense(g);
  const userOff = off.team.user;
  const row = (s: Side) => `<tr><td>${esc(s.team.name)}</td>${Array.from({ length: n }, (_, i) => {
    const v = s.inn[i];
    const now = !g.over && i === g.inning - 1 && ((s === g.away && g.half === 0) || (s === g.home && g.half === 1));
    const x = s === g.home && g.over && i === g.inning - 1 && g.half === 0 ? 'x' : '';
    return `<td class="${now ? 'now' : ''}">${v == null ? x : v}</td>`;
  }).join('')}<td class="tot num">${s.runs}</td><td class="num">${s.hits}</td></tr>`;

  let h = '';
  if (state.report) {
    const r = state.report;
    h += `<details class="card"><summary><b>今週の練習(${MENUS[r.menu].name})の成果</b> <span class="small muted">${r.rep.length}人が成長</span></summary>
    <div class="small" style="margin-top:6px">${r.rep.length
      ? r.rep.map((x) => `${esc(x.name)}: ${x.ups.map(([k, v]) => `${LABEL[k]}<span class="up">+${v}</span>`).join(' ')}`).join('<br>')
      : '目に見える成長はありませんでした.'}</div></details>`;
  }
  h += `<div class="lines"><table><thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th class="tot">計</th><th>安</th></tr></thead><tbody>${row(g.away)}${row(g.home)}</tbody></table></div>`;

  if (g.over) {
    const us = userSide(g), them = us === g.home ? g.away : g.home;
    const res = us.runs > them.runs ? '勝利!' : us.runs < them.runs ? '敗戦' : '引き分け';
    h += `<div class="card"><div class="result px">${res} ${us.runs} - ${them.runs}</div><div class="row" style="justify-content:center"><button class="btn" data-a="final">結果を確定して次の週へ</button></div></div>`;
  } else {
    const b = off.lineup[off.bi].p, p = def.pitcher, lim = pitchLimit(p), sta = clamp((lim - def.pc) / lim, 0, 1);
    h += `<div class="card field"><div>${fieldSVG(g)}</div><div>
      <div class="row px" style="justify-content:space-between"><span>${g.inning}回${g.half ? '裏' : '表'}</span><span class="lamps" aria-label="${g.outs}アウト">アウト ${[0, 1].map((i) => `<span class="lamp ${g.outs > i ? 'on' : ''}"></span>`).join('')}</span></div>
      <h3>打者 ${off.bi + 1}番 ${esc(b.name)} <span class="small muted">${esc(off.team.name)}</span></h3>${attrsHTML(b)}
      <div class="small muted">${condHTML(b)}</div>
      <h3>投手 ${esc(p.name)} <span class="small muted">${esc(def.team.name)}</span></h3>${attrsHTML(p)}
      <div class="stam"><span>球数 ${def.pc}</span><span class="bar"><i style="width:${sta * 100}%;background:${sta < 0.25 ? 'var(--bad)' : 'var(--btn)'}"></i></span></div>
    </div></div>`;
    const chip = (k: string, lbl: string, disabled = false) =>
      `<button class="chip" data-a="tac" data-k="${k}" aria-pressed="${state.tac === k}" ${disabled ? 'disabled' : ''}>${lbl}</button>`;
    h += `<div class="card"><h3 style="margin-top:0">${userOff ? '攻撃の作戦' : '守備の作戦'}<span class="small muted">(次の1打席だけ有効)</span></h3><div class="chips">`;
    h += userOff
      ? chip('none', 'おまかせ') + chip('swing', '強振') + chip('bunt', '送りバント', !canBunt(g)) + chip('steal', '盗塁', !canSteal(g))
      : chip('none', 'おまかせ') + chip('ibb', '敬遠');
    h += `</div>`;
    if (!userOff) {
      const rel = relievers(def);
      h += `<h3>継投</h3><div class="chips">${rel.length
        ? rel.map((x) => `<button class="chip" data-a="chgP" data-id="${x.id}">${esc(x.name)} ${gradeBadge(x.velo)}${gradeBadge(x.ctrl)}</button>`).join('')
        : '<span class="small muted">交代できる投手がいません.</span>'}</div><p class="small muted" style="margin:4px 0 0">疲れると自動でも交代します.</p>`;
    }
    h += `<div class="row" style="margin-top:12px"><button class="btn" data-a="s1">1打席進める</button><button class="btn ghost" data-a="sI">このイニングを最後まで</button><button class="btn ghost" data-a="sA">試合終了まで</button></div></div>`;
  }
  h += `<h2>実況</h2><div class="card"><ul class="log">${g.log.map((l) => `<li><span class="t">${l.tag}</span><span class="${l.hl ? 'hl' : ''}">${esc(l.t)}</span></li>`).join('')}</ul></div>`;
  return h;
}

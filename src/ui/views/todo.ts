import { RECIPES, canCook } from '../../growth/meals';
import { FACILITIES, upgradeCost, MAX_FAC } from '../../league/economy';
import { goalProgress } from '../../league/goals';
import { convertAdvice } from '../../league/convert';
import { POS_NAME } from '../../data/constants';
import { chapterTitle, PHASES, phaseOf, storyBeat } from '../../league/story';
import { warnings } from '../../league/warnings';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { state } from '../state';

interface Row { icon: string; text: string; jump?: string; level?: 'warn' | 'ok'; }

/** 「今週やること」.いま気にしたい項目を,短く並べる. */
export function todoHTML(c: Career): string {
  const rows: Row[] = [];
  if (c.event) rows.push({ icon: '❗', text: `出来事「${c.event.title}」に返事をする`, level: 'warn' });
  const bad = warnings(c, state.menu, state.practice).find((w) => w.level !== 'info' && w.text.startsWith('疲れ'));
  if (bad) rows.push({ icon: '⚠', text: '疲れがたまっています.休養を考えましょう', level: 'warn' });
  const cookable = RECIPES.filter((r) => canCook(c, r)).length;
  if (cookable && !c.meal) rows.push({ icon: '🍙', text: `料理が作れます(${cookable}品)`, jump: 'kitchen' });
  const cheapest = Math.min(...FACILITIES.filter((f) => c.fac[f.key] < MAX_FAC).map((f) => upgradeCost(c, f.key)));
  if (Number.isFinite(cheapest) && c.funds >= cheapest) rows.push({ icon: '🏗', text: '資金で施設を強化できます', jump: 'facilities' });
  if (!rows.length) return '';
  return `<div class="card todo"><p style="margin:0 0 4px"><b>今週やること</b></p><ul class="todo-list">${rows.map((r) =>
    `<li class="${r.level ?? ''}"><span aria-hidden="true">${r.icon}</span> ${esc(r.text)}${r.jump ? ` <button class="linkish small" data-a="jump" data-k="${r.jump}">開く</button>` : ''}</li>`).join('')}</ul></div>`;
}

/** 今年のオーナーの目標 */
export function goalsHTML(c: Career): string {
  if (!c.goals.length) return '<p class="small muted" style="margin:0">今年の目標はまだありません.</p>';
  return `<p class="small muted" style="margin:0 0 6px">オーナーからの今年の目標です.達成すると,信頼度と資金がもらえます.判定は1年の終わりです.</p>
  <div class="plist">${c.goals.map((g) => `<div class="pl"><div class="top"><span class="nm">🎯 ${esc(g.text)}</span></div><span class="small">${esc(goalProgress(c, g))}</span><br><span class="small muted">報酬: 信頼度+${g.reward.trust} / 資金+${g.reward.funds}万円</span></div>`).join('')}</div>`;
}

/** 起承転結.いまがどの場面か,一言で見せる. */
export function storyHTML(c: Career): string {
  const ph = phaseOf(c);
  return `<div class="card story"><p style="margin:0"><b>${esc(chapterTitle(c))}</b></p>
  <div class="phases" role="list">${PHASES.map(([k, n, d]) => `<span class="ph ${k === ph ? 'on' : ''}" role="listitem" title="${d}"><b>${n}</b><small>${d}</small></span>`).join('')}</div>
  <p class="small" style="margin:6px 0 0">${esc(storyBeat(c))}</p></div>`;
}

/** コンバートのおすすめ.キャンプの時期はホームに,いつでもオーダー画面に出す. */
export function convertTipsHTML(c: Career, title: string): string {
  const tips = convertAdvice(c);
  if (!tips.length) return '';
  const u = c.teams.find((t) => t.user)!;
  return `<div class="card"><p style="margin:0"><b>🔧 ${esc(title)}</b></p><p class="small muted" style="margin:2px 0 6px">いまの先発と控えを見た,守備位置の転向のおすすめです.時間はかかりますが,守備の落ち込みを解消したり,競争を生んだりできます.</p>
  <div class="plist">${tips.map((t) => { const p = u.players.find((x) => x.id === t.pid)!; return `<div class="pl"><div class="top"><span class="nm">${esc(p.name)}<span class="tag">${POS_NAME[p.pos]}→${POS_NAME[t.to]}</span></span><button class="btn" data-a="convert" data-id="${t.pid}" data-k="${t.to}">${t.weeks}週で挑戦</button></div><span class="small">${esc(t.text)}</span><br><span class="small muted">成功率${Math.round(t.chance * 100)}%</span></div>`; }).join('')}</div></div>`;
}

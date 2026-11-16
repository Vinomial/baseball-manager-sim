/** ホームの「キャンプの方針」.1〜2 月のあいだに,レギュラー特訓の目標とコンバートをまとめて決める. */
import { LABEL, POS_NAME } from '../../data/constants';
import { keysOf } from '../../growth/player';
import { CAMP_END } from '../../league/calendar';
import { convertAdvice, convertOptions } from '../../league/convert';
import { userTeam } from '../../league/season';
import { TRAIN_GOAL_MULT, TRAIN_SLOTS, TRAIN_STEPS, trainingCount } from '../../league/story';
import type { Career, Player } from '../../types';
import { esc } from '../../util/format';
import { state } from '../state';

/** 特訓の候補にしやすい選手(先発・ローテーションの中で,伸びしろの大きい順) */
function candidates(c: Career): Player[] {
  const u = userTeam(c);
  const regular = new Set([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
  const room = (p: Player) => keysOf(p).reduce((s, k) => s + Math.max(0, p.pot[k] - p[k]), 0);
  return [...u.players].sort((a, b) => Number(regular.has(b.id)) - Number(regular.has(a.id)) || room(b) - room(a));
}

export function campHTML(c: Career): string {
  const u = userTeam(c);
  const left = CAMP_END - c.cal;
  const goals = u.players.filter((p) => p.train && p.train.season === c.season);
  const list = candidates(c).filter((p) => !(p.train && p.train.season === c.season));
  const pick = list.find((p) => p.id === state.campPick) ?? list[0];
  let h = `<div class="card camp"><p style="margin:0"><b>🏕 キャンプの方針</b> <span class="small muted">あと${left}週(2月まで)</span></p>
  <p class="small muted" style="margin:2px 0 6px">レギュラー特訓とコンバートは,キャンプのあいだだけ決められます.決めたものは1年かけて進みます.</p>`;

  h += `<h3>レギュラー特訓 <span class="small muted">${trainingCount(c)}/${TRAIN_SLOTS}人</span></h3>
  <p class="small muted" style="margin:0 0 4px">選んだ能力が,練習で${TRAIN_GOAL_MULT}倍伸びます.年末に目標に届けば,伸びしろが広がり,やる気も大きく上がります.</p>`;
  for (const p of goals) {
    const t = p.train!;
    h += `<div class="pl"><div class="top"><span class="nm">🎯 ${esc(p.name)} <span class="tag">${LABEL[t.attr]} ${t.from}→${t.target}</span></span><button class="btn ghost" data-a="trainclear" data-id="${p.id}">やめる</button></div></div>`;
  }
  if (goals.length < TRAIN_SLOTS && pick) {
    h += `<label class="small">選手 <select data-c="campp">${list.map((p) => `<option value="${p.id}" ${p === pick ? 'selected' : ''}>${esc(p.name)}(${p.role === '投手' ? '投' : POS_NAME[p.pos as keyof typeof POS_NAME]} ${p.age}歳)</option>`).join('')}</select></label>
    <div class="plist">${keysOf(pick).map((k) => `<div class="pl"><div class="top"><span class="nm">${LABEL[k]} <span class="muted small">いま ${Math.round(pick[k])}</span></span><span>${TRAIN_STEPS.map((n) => `<button class="mini" data-a="trainset" data-id="${pick.id}" data-k="${k}" data-i="${n}">+${n}</button>`).join(' ')}</span></div></div>`).join('')}</div>`;
  }

  h += `<h3>コンバート</h3>`;
  const conv = u.players.filter((p) => p.conv);
  for (const p of conv) h += `<div class="pl"><div class="top"><span class="nm">🔧 ${esc(p.name)} <span class="tag">${POS_NAME[p.pos as keyof typeof POS_NAME]}→${POS_NAME[p.conv!.to]}</span> <span class="small muted">あと${p.conv!.left}週</span></span><button class="btn ghost" data-a="convert-cancel" data-id="${p.id}">やめる</button></div></div>`;
  const tips = convertAdvice(c);
  if (tips.length) {
    h += `<p class="small muted" style="margin:0 0 4px">いまの先発と控えを見た,おすすめです.</p><div class="plist">${tips.map((t) => {
      const p = u.players.find((x) => x.id === t.pid)!;
      return `<div class="pl"><div class="top"><span class="nm">${esc(p.name)}<span class="tag">${POS_NAME[p.pos as keyof typeof POS_NAME]}→${POS_NAME[t.to]}</span></span><button class="btn" data-a="convert" data-id="${t.pid}" data-k="${t.to}">${t.weeks}週で挑戦</button></div><span class="small">${esc(t.text)}</span><br><span class="small muted">成功率${Math.round(t.chance * 100)}%</span></div>`;
    }).join('')}</div>`;
  }
  // 上で選んだ選手が野手なら,ほかの守備位置も選べる
  if (pick && pick.role === '野手' && !pick.conv) {
    h += `<p class="small muted" style="margin:6px 0 4px">${esc(pick.name)}のほかの守備位置(上の「選手」で選び直せます)</p><div class="plist">${convertOptions(pick).slice(0, 3).map((o) =>
      `<div class="pl"><div class="top"><span class="nm">${POS_NAME[o.to]} <span class="tag">適性${o.score}</span></span><button class="btn ghost" data-a="convert" data-id="${pick.id}" data-k="${o.to}">${o.weeks}週で挑戦</button></div><span class="small muted">${o.note} / 成功率${Math.round(o.chance * 100)}%</span></div>`).join('')}</div>`;
  } else if (!tips.length && !conv.length) h += '<p class="small muted" style="margin:0">いまはおすすめのコンバートはありません.</p>';
  return h + '</div>';
}

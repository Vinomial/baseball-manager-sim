/** 選手の詳細画面.能力のグラフ,成長の推移,通算成績,コンバート. */
import { LABEL, POS_NAME } from '../data/constants';
import { pitchName, PITCHES, SKILLS, skillName } from '../growth/abilities';
import { keysOf, roomWord } from '../growth/player';
import { extensionFee, leavingRisk, multiYearSalary } from '../league/contracts';
import { convertOptions } from '../league/convert';
import { fmtYen } from '../league/finance';
import type { AttrKey, Career, PitchKey, Player } from '../types';
import { esc } from '../util/format';
import { legendHTML, lineSVG, radarSVG, type Series } from './charts';
import { moraleLabel, PERS } from '../growth/personality';
import { planDef, planOf, plansFor, suggestPlan } from '../growth/plans';
import { TRAIN_SLOTS, TRAIN_STEPS } from '../league/story';
import { avatar } from './avatar';
import { careerTable, condHTML, gradeHTML, playerStars } from './components';

const COLORS = ['var(--btn)', 'var(--accent)', '#2C8EA3', '#C2407F'];

export function findAnyPlayer(c: Career, id: number): { p: Player; team: string; mine: boolean } | null {
  for (const t of c.teams) {
    const p = t.players.find((x) => x.id === id);
    if (p) return { p, team: t.name, mine: t.user };
  }
  const f = c.fa.find((x) => x.id === id);
  return f ? { p: f, team: '自由契約', mine: false } : null;
}

export function detailSheet(c: Career, id: number): string {
  const r = findAnyPlayer(c, id);
  if (!r) return '';
  const { p, mine } = r;
  const ks = keysOf(p);
  const labels = ks.map((k) => LABEL[k]);
  // 伸びしろの上限は,正確には見せず 5 きざみにする
  const cap = (k: AttrKey) => Math.round((p.pot[k] + ((p.id * 7 + k.length * 3) % 9) - 4) / 5) * 5;
  const radar: Series[] = [
    { name: '現在', color: 'var(--btn)', values: ks.map((k) => p[k]) },
    { name: '上限の目安', color: 'var(--accent)', dash: '5 4', values: ks.map(cap) },
  ];
  const hist = p.seasons.filter((s) => s.attrs);
  let growth = '<p class="small muted" style="margin:0">シーズンを重ねると,能力の推移が表示されます.</p>';
  if (hist.length >= 1) {
    const series: Series[] = ks.map((k, i) => ({ name: LABEL[k], color: COLORS[i % COLORS.length], values: [...hist.map((s) => s.attrs![k] ?? p[k]), Math.round(p[k])] }));
    growth = `${legendHTML(series)}${lineSVG(series, { yMin: 0 })}<p class="small muted" style="margin:2px 0 0">左が昔,右が今です.</p>`;
  }
  const abil = [
    ...(Object.keys(p.pitches) as PitchKey[]).map((k) => `<div class="abrow"><span class="ab">${pitchName(k)} Lv${p.pitches[k]}</span><span class="small muted">${PITCHES.find((x) => x.key === k)!.desc}</span></div>`),
    ...p.skills.map((s) => `<div class="abrow"><span class="ab">${skillName(s)}</span><span class="small muted">${SKILLS.find((x) => x.key === s)!.desc}</span></div>`),
  ].join('') || '<p class="small muted" style="margin:0">特殊能力・球種はまだありません.</p>';

  let conv = '';
  if (mine && p.role === '野手') {
    if (p.conv) conv = `<p class="small">🔧 ${POS_NAME[p.conv.to]}へコンバート中(あと${p.conv.left}週).守備練習の週は進みが速くなります.</p><button class="btn ghost" data-a="convert-cancel" data-id="${p.id}">やめる</button>`;
    else conv = `<p class="small muted" style="margin:0 0 6px">守備位置を変えると,新しい位置が本職になり,前の位置はサブポジとして残ります.時間がかかり,失敗することもあります.</p><div class="plist">${convertOptions(p).slice(0, 4).map((o) =>
      `<div class="pl"><div class="top"><span class="nm">${POS_NAME[o.to]} <span class="tag">適性${o.score}</span></span><button class="btn ghost" data-a="convert" data-id="${p.id}" data-k="${o.to}">${o.weeks}週で挑戦</button></div><span class="small muted">${o.note} / 成功率${Math.round(o.chance * 100)}%</span></div>`).join('')}</div>`;
  }
  let plan = '';
  if (mine) {
    const cur = planOf(p), sug = suggestPlan(p);
    plan = `<h3>育成方針</h3><p class="small muted" style="margin:0 0 6px">選んだタイプに向けて,練習の伸びが偏ります(重点は +25%,それ以外は -8%).いまの能力に合うおすすめは「${planDef(sug).name}」です.</p>
    <div class="chips">${plansFor(p).map((d) => `<button class="chip" data-a="plan" data-id="${p.id}" data-k="${d.key}" aria-pressed="${cur === d.key}" title="${esc(d.desc)}">${d.name}${d.key === sug ? ' ★' : ''}</button>`).join('')}</div>
    <p class="small" style="margin:4px 0 0">${esc(planDef(cur).desc)}</p>`;
    const t = p.train && p.train.season === c.season ? p.train : null;
    plan += `<h3>レギュラー特訓(今年の目標)</h3>`;
    if (t) plan += `<p class="small">🎯 ${LABEL[t.attr]}を ${t.from} → <b>${t.target}</b> に(いま ${Math.round(p[t.attr])}).達成すると,伸びしろが広がり,やる気も大きく上がります.</p><button class="btn ghost" data-a="trainclear" data-id="${p.id}">目標をやめる</button>`;
    else plan += `<p class="small muted" style="margin:0 0 6px">能力を1つ選び,今年中に伸ばす目標を立てます(同時に${TRAIN_SLOTS}人まで).</p><div class="plist">${ks.map((k) => `<div class="pl"><div class="top"><span class="nm">${LABEL[k]} <span class="muted small">${Math.round(p[k])}</span></span><span>${TRAIN_STEPS.map((u) => `<button class="mini" data-a="trainset" data-id="${p.id}" data-k="${k}" data-i="${u}">+${u}</button>`).join(' ')}</span></div></div>`).join('')}</div>`;
  }
  let contract = '';
  if (mine) {
    const yrs = p.years ?? 1;
    contract = `<h3>契約</h3><p class="small" style="margin:0 0 4px">年俸 ${fmtYen(p.salary)} / ${p.loan !== undefined ? `助っ人(あと${p.loan}年)` : yrs > 1 ? `複数年契約(あと${yrs}年)` : '1年ごとの契約'}</p>`;
    if (leavingRisk(p)) contract += `<p class="warnbox bad small" style="margin:4px 0">⚠ やる気が低く,今年の終わりに<b>FA権を行使して退団</b>するかもしれません.複数年契約を結ぶと,引き止められます.</p>`;
    if (p.loan === undefined && yrs <= 1) contract += `<div class="row">${[2, 3].map((y) => `<button class="btn ghost" data-a="extend" data-id="${p.id}" data-i="${y}">${y}年契約 年俸${fmtYen(multiYearSalary(p, y))}(契約金 ${fmtYen(extensionFee(p, y))})</button>`).join('')}</div>`;
  }
  const histHTML = p.story?.length ? `<h3>ヒストリー</h3><ul class="recap">${[...p.story].reverse().slice(0, 12).map((x) => `<li><span class="muted">第${x.season}季</span> ${esc(x.text)}</li>`).join('')}</ul>` : '';
  return `<div class="sheet-bg" data-a="detail-close"></div><div class="sheet detail" role="dialog" aria-label="選手の詳細">
  <div class="sheet-h"><b>${avatar(p, 44)} ${esc(p.name)} <span class="tag">${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span></b><button class="btn ghost" data-a="detail-close" aria-label="閉じる">✕</button></div>
  <p class="small" style="margin:0">${esc(r.team)} / 成長タイプ: ${p.type} / 伸びしろ: ${roomWord(p)} / 年俸 ${fmtYen(p.salary)}${p.alt?.length ? ` / サブポジ: ${p.alt.map((x) => POS_NAME[x]).join('・')}` : ''}</p>
  <p style="margin:0">${condHTML(p)}</p>
  <p style="margin:4px 0 0">${playerStars(p)}</p>
  <p class="small" style="margin:4px 0 0">性格: <b>${PERS[p.pers].name}</b> <span class="muted">${PERS[p.pers].desc}</span></p>
  <div class="chem"><span class="who">やる気 ${Math.round(p.morale)}</span><span class="bar"><i style="width:${p.morale}%;${p.morale < 35 ? 'background:var(--bad)' : ''}"></i></span><span class="small">${moraleLabel(p.morale)}</span></div>
  <h3>能力</h3>
  <div class="charts">${radarSVG(labels, radar)}<div>${legendHTML(radar)}${ks.map((k) => `<div class="drow"><span>${LABEL[k]}</span>${gradeHTML(p[k])}<span class="small muted">上限 ${cap(k)}前後</span></div>`).join('')}</div></div>
  <h3>能力の推移</h3>${growth}
  <h3>球種・特殊能力</h3>${abil}
  ${contract}
  ${plan}
  ${conv ? `<h3>コンバート</h3>${conv}` : ''}
  ${histHTML}
  <h3>通算成績</h3>${careerTable(p, c.phase === 'season')}
  </div>`;
}

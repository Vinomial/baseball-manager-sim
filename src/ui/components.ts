import { COND, LABEL } from '../data/constants';
import { keysOf } from '../growth/player';
import { LEAGUES, POS_NAME } from '../data/constants';
import { abilityLabels } from '../growth/abilities';
import { careerStats, fmt3 } from '../league/leaders';
import type { Game, Player, Stats } from '../types';
import { state } from './state';
import { esc, fmtEra, grade } from '../util/format';

export function gradeHTML(v: number): string {
  const g = grade(v);
  return `<span class="g g${g}">${g}</span><span class="gv">${Math.round(v)}</span>`;
}

export function gradeBadge(v: number): string {
  const g = grade(v);
  return `<span class="g g${g}">${g}</span>`;
}

export function abilitiesHTML(p: Player): string {
  const l = abilityLabels(p);
  return l.length ? `<div class="abil">${l.map((x) => `<span class="ab">${esc(x)}</span>`).join('')}</div>` : '';
}

export function attrsHTML(p: Player): string {
  return `<div class="attrs">${keysOf(p).map((k) => `<label>${LABEL[k]}</label>${gradeHTML(p[k])}`).join('')}</div>${abilitiesHTML(p)}`;
}

export function condHTML(p: Player): string {
  const [n, i] = COND[p.cond];
  const hurt = p.inj && p.inj.weeks > 0 ? `<span class="injtag">🩹${esc(p.inj.name)} あと${p.inj.weeks}週</span> ` : '';
  const tired = p.fatigue >= 60 ? `<span class="tiredtag ${p.fatigue >= 80 ? 'bad' : ''}">疲労${Math.round(p.fatigue)}</span> ` : '';
  return `${hurt}${tired}<span class="cond c${p.cond}">${i}${n}</span>`;
}

export function fieldSVG(g: Game): string {
  const B = g.bases;
  const on = (i: number) => (B[i] ? 'var(--sel)' : '#fff');
  const lbl = (i: number, x: number, y: number, anc: string) => {
    const r = B[i];
    return r ? `<text x="${x}" y="${y}" font-size="9" text-anchor="${anc}" fill="var(--ink)">${esc(r.name.split(' ')[0])}</text>` : '';
  };
  const runners = B.map((r, i) => (r ? ['一', '二', '三'][i] + '塁' : '')).filter(Boolean).join(',') || 'なし';
  return `<svg viewBox="0 0 200 175" role="img" aria-label="走者 ${runners}">
  <path d="M100 168 L8 76 A130 130 0 0 1 192 76 Z" fill="var(--grass)"/>
  <path d="M100 160 L150 110 L100 60 L50 110 Z" fill="var(--dirt)"/>
  <path d="M100 148 L138 110 L100 72 L62 110 Z" fill="var(--grass2)"/>
  <circle cx="100" cy="110" r="7" fill="var(--dirt)"/>
  <rect x="94" y="154" width="12" height="12" transform="rotate(45 100 160)" fill="#fff"/>
  <rect x="144" y="104" width="12" height="12" transform="rotate(45 150 110)" fill="${on(0)}" stroke="#0005"/>
  <rect x="94" y="54" width="12" height="12" transform="rotate(45 100 60)" fill="${on(1)}" stroke="#0005"/>
  <rect x="44" y="104" width="12" height="12" transform="rotate(45 50 110)" fill="${on(2)}" stroke="#0005"/>
  ${lbl(0, 158, 128, 'start')}${lbl(1, 100, 46, 'middle')}${lbl(2, 42, 128, 'end')}
  </svg>`;
}

const avgOf = (s: Stats): string => (s.ab ? fmt3(s.h / s.ab) : '---');

/** 通算成績の表.過去のシーズンごとの成績と,通算の行. */
export function careerTable(p: Player, current: boolean): string {
  const bat = p.role === '野手';
  const lines = p.seasons.map((x) => ({ label: `${x.season}年`, team: `${LEAGUES[x.level].name.replace('リーグ', '')} ${x.team}`, s: x.stats }));
  if (current && p.stats.g > 0) lines.push({ label: '今季', team: '', s: p.stats });
  if (!lines.length) return '<p class="small muted">まだ成績がありません.</p>';
  const tot = careerStats(p, current);
  const head = bat ? '<th>年</th><th>所属</th><th>試</th><th>打率</th><th>本</th><th>点</th><th>盗</th>' : '<th>年</th><th>所属</th><th>登</th><th>勝-敗</th><th>防御率</th><th>三振</th>';
  const row = (l: string, t: string, s: Stats, cls = '') => bat
    ? `<tr class="${cls}"><td>${l}</td><td>${esc(t)}</td><td>${s.g}</td><td>${avgOf(s)}</td><td>${s.hr}</td><td>${s.rbi}</td><td>${s.sb}</td></tr>`
    : `<tr class="${cls}"><td>${l}</td><td>${esc(t)}</td><td>${s.g}</td><td>${s.w}-${s.l}</td><td>${fmtEra(s.r, s.outs)}</td><td>${s.k}</td></tr>`;
  return `<div class="scroll"><table class="std box career"><thead><tr>${head}</tr></thead><tbody>${lines.map((x) => row(x.label, x.team, x.s)).join('')}${row('通算', '', tot, 'me')}</tbody></table></div>`;
}

/** 選手 1 人の詳細(成長タイプ,伸びしろ,通算成績). */
export function playerDetail(p: Player, current: boolean, room: string): string {
  return `<div class="detail">${POS_NAME[p.pos]} / ${p.age}歳 / 成長タイプ: ${p.type} / 伸びしろ: ${room}${careerTable(p, current)}</div>`;
}

/** 折りたたみ.開いているかどうかは再描画しても保たれる. */
export function fold(id: string, title: string, summary: string, body: string, openDefault = false): string {
  const open = state.folds[id] ?? openDefault;
  return `<details class="fold card" data-fold="${id}" ${open ? 'open' : ''}><summary><b>${title}</b> <span class="small muted">${summary}</span></summary><div class="fold-body">${body}</div></details>`;
}

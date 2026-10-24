import { COND, LABEL } from '../data/constants';
import { keysOf } from '../growth/player';
import type { Game, Player } from '../types';
import { esc, grade } from '../util/format';

export function gradeHTML(v: number): string {
  const g = grade(v);
  return `<span class="g g${g}">${g}</span><span class="gv">${Math.round(v)}</span>`;
}

export function gradeBadge(v: number): string {
  const g = grade(v);
  return `<span class="g g${g}">${g}</span>`;
}

export function attrsHTML(p: Player): string {
  return `<div class="attrs">${keysOf(p).map((k) => `<label>${LABEL[k]}</label>${gradeHTML(p[k])}`).join('')}</div>`;
}

export function condHTML(p: Player): string {
  const [n, i] = COND[p.cond];
  return `<span class="cond c${p.cond}">${i}${n}</span>`;
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

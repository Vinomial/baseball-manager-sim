/** 選手カード(SVG).トレーディングカードのように,顔・総合値・能力のバーを 1 枚にまとめる. */
import { LABEL, POS_NAME } from '../data/constants';
import { abilityLabels } from '../growth/abilities';
import { keysOf, playerValue } from '../growth/player';
import type { Player } from '../types';
import { esc, grade } from '../util/format';
import { avatarParts } from './avatar';

/** 能力のランクの色(styles.css の .gS〜.gG と同じ) */
const GRADE_COLOR: Record<string, string> = {
  S: '#A8326A', A: '#BF3A24', B: '#A85F12', C: '#7F6700', D: '#4B7A1F', E: '#1F7488', F: '#4F5F8C', G: '#666666',
};

/** レア度ごとの枠の色 [外枠, 内側の地, 文字] */
const RARITY: Record<number, { name: string; frame: string; frame2: string; bg: string; ink: string }> = {
  1: { name: 'NORMAL', frame: '#5D6E63', frame2: '#8A9A8F', bg: '#F3F1E7', ink: '#17241C' },
  2: { name: 'RARE', frame: '#2C6EA3', frame2: '#6FA8D6', bg: '#EEF4F8', ink: '#13263A' },
  3: { name: 'EPIC', frame: '#6A3FA0', frame2: '#B08BDB', bg: '#F3EEF8', ink: '#25163A' },
  4: { name: 'LEGEND', frame: '#9A6B00', frame2: '#F5C84C', bg: '#FBF5E2', ink: '#2E2100' },
};

/** レア度.総合値のランク(A 以上 LEGEND,B EPIC,C RARE)で決まる. */
export const rarityOf = (p: Player): number => {
  const v = playerValue(p);
  return v >= 80 ? 4 : v >= 70 ? 3 : v >= 60 ? 2 : 1;
};

export interface CardOpts {
  /** ユニフォームと背景の色 */
  jersey?: string;
  /** 表示の幅(px).高さは 1.4 倍. */
  width?: number;
}

/** 1 枚の選手カード */
export function cardSVG(p: Player, o: CardOpts = {}): string {
  const r = RARITY[rarityOf(p)];
  const W = 160, H = 224;
  const ovr = Math.round(playerValue(p));
  const team = o.jersey ?? '#2B6A44';
  const ks = keysOf(p);
  const top = 118, rowH = ks.length > 3 ? 16 : 20;
  const rows = ks.map((k, i) => {
    const v = Math.round(p[k]), cap = Math.min(99, Math.round(p.pot[k]));
    const g = grade(v), y = top + i * rowH;
    const bw = 70;
    return `<text x="12" y="${y + 9}" font-size="9" fill="${r.ink}">${LABEL[k]}</text>
      <rect x="44" y="${y + 2}" width="${bw}" height="8" rx="1" fill="#0001" stroke="${r.ink}22"/>
      <rect x="44" y="${y + 2}" width="${(bw * v) / 100}" height="8" rx="1" fill="${GRADE_COLOR[g]}"/>
      <rect x="${44 + (bw * cap) / 100 - 0.5}" y="${y}" width="1.2" height="12" fill="${r.ink}" opacity=".45"/>
      <rect x="120" y="${y}" width="13" height="12" rx="2" fill="${GRADE_COLOR[g]}"/>
      <text x="126.5" y="${y + 9.5}" font-size="9" fill="#fff" text-anchor="middle">${g}</text>
      <text x="149" y="${y + 9.5}" font-size="9" fill="${r.ink}" text-anchor="end">${v}</text>`;
  }).join('');
  const abil = abilityLabels(p).slice(0, 2).map(esc).join(' / ');
  const id = `cd${p.id}`;
  return `<svg class="pcard" ${o.width ? `width="${o.width}" height="${Math.round(o.width * 1.4)}"` : ''} viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)}のカード 総合${ovr}" font-family="DotGothic16, sans-serif">
  <defs><linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${r.frame2}"/><stop offset=".5" stop-color="${r.frame}"/><stop offset="1" stop-color="${r.frame2}"/></linearGradient>
  <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${team}"/><stop offset="1" stop-color="${team}" stop-opacity=".55"/></linearGradient></defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="9" fill="url(#${id}f)"/>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="6" fill="${r.bg}"/>
  <rect x="10" y="10" width="${W - 20}" height="72" rx="3" fill="url(#${id}s)"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="10" y="${54 + i * 7}" width="${W - 20}" height="3" fill="#fff" opacity=".08"/>`).join('')}
  <g transform="translate(${W / 2 - 33} 16) scale(5.5)" shape-rendering="crispEdges">${avatarParts(p, team)}</g>
  <rect x="13" y="13" width="26" height="15" rx="2" fill="#000" opacity=".45"/>
  <text x="26" y="24.5" font-size="10" fill="#fff" text-anchor="middle">${p.role === '投手' ? '投' : p.pos}</text>
  <rect x="${W - 48}" y="13" width="35" height="26" rx="3" fill="#000" opacity=".5"/>
  <text x="${W - 30.5}" y="22" font-size="6.5" fill="#fff" text-anchor="middle">総合</text>
  <text x="${W - 30.5}" y="35" font-size="13" fill="#F5C84C" text-anchor="middle">${ovr}</text>
  <rect x="10" y="84" width="${W - 20}" height="28" rx="3" fill="${r.frame}"/>
  <text x="${W / 2}" y="97" font-size="11" fill="#fff" text-anchor="middle">${esc(p.name)}</text>
  <text x="${W / 2}" y="108" font-size="7" fill="#fff" opacity=".85" text-anchor="middle">${p.role === '投手' ? '投手' : POS_NAME[p.pos]} / ${p.age}歳 / ${esc(p.type)}</text>
  ${rows}
  ${abil ? `<text x="${W / 2}" y="${H - 22}" font-size="7.5" fill="${r.ink}" text-anchor="middle">${abil}</text>` : ''}
  <text x="${W / 2}" y="${H - 11}" font-size="7" fill="${r.frame}" text-anchor="middle" letter-spacing="1.5">★ ${r.name} ★</text>
</svg>`;
}

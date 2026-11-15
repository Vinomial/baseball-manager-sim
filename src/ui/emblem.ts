/** チームのエンブレム(SVG).チーム名から形と色をいつも同じに決める. */
import type { Team } from '../types';
import { esc } from '../util/format';

const COLORS: [string, string][] = [
  ['#2B6A44', '#F5C84C'], ['#2C6EA3', '#FFFFFF'], ['#B23A2E', '#F5E6C8'], ['#6A3FA0', '#F5C84C'], ['#1F2A44', '#E46A2E'],
  ['#7A5700', '#FFFFFF'], ['#2C8EA3', '#14323A'], ['#C2407F', '#FFFFFF'], ['#3D3D3D', '#E7C25A'], ['#0F5E4E', '#E8F0D8'],
  ['#8C2F1B', '#F2C14E'], ['#24507A', '#E04F5F'],
];

const hashStr = (s: string): number => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0; return h; };

/** チームの色 [地の色, 文字の色] */
export const teamColors = (t: Pick<Team, 'name'>): [string, string] => COLORS[hashStr(t.name) % COLORS.length];

/** エンブレムに入れる 1 文字.「ニューヨーク・キングス」なら「キ」. */
export const emblemChar = (name: string): string => {
  const tail = name.includes('・') ? name.split('・').pop()! : name;
  return [...tail][0] ?? '?';
};

export function emblem(t: Pick<Team, 'name'>, size = 22): string {
  const [bg, ink] = teamColors(t);
  const shape = (hashStr(t.name) >> 5) % 3;
  const body = shape === 0
    ? `<path d="M2 2h20v9c0 6-5 10-10 12C7 21 2 17 2 11z" fill="${bg}" stroke="${ink}" stroke-width="1.5"/>`
    : shape === 1
      ? `<circle cx="12" cy="12" r="10.5" fill="${bg}" stroke="${ink}" stroke-width="1.5"/>`
      : `<path d="M12 1l11 11-11 11L1 12z" fill="${bg}" stroke="${ink}" stroke-width="1.5"/>`;
  return `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${esc(t.name)}のエンブレム">${body}<text x="12" y="16.2" font-size="11" text-anchor="middle" fill="${ink}" font-family="DotGothic16, sans-serif">${esc(emblemChar(t.name))}</text></svg>`;
}

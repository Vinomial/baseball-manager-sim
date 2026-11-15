/** 本拠地のドット絵(SVG).施設を強くするほど,スタンドや照明,建物が増えていく. */
import type { Career, FacKey } from '../types';
import { teamColors } from './emblem';

const px = (x: number, y: number, w: number, h: number, c: string, extra = ''): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${extra}/>`;

export function stadiumSVG(c: Career, teamName: string): string {
  const f: Record<FacKey, number> = c.fac;
  const [team] = teamColors({ name: teamName });
  const W = 160, H = 96;
  const parts: string[] = [];
  // 空と遠くの山
  parts.push(px(0, 0, W, H, '#9ED3F0'), px(0, 30, W, 8, '#B9DDEF'));
  parts.push(`<path d="M0 40 L22 30 L40 38 L62 28 L88 39 L112 31 L136 38 L160 32 V44 H0Z" fill="#7FB38A"/>`);
  // スタンド(スタジアムのレベルごとに 1 段ずつ高くなる)
  const tiers = Math.min(5, f.stadium);
  for (let t = 0; t < tiers; t++) {
    const y = 42 - (t + 1) * 5, inset = 8 + t * 10;
    parts.push(px(inset, y, W - inset * 2, 5, t % 2 ? '#C9CED6' : '#AEB5C0'));
    // 観客(点々).スタンドが大きいほど多い
    for (let x = inset + 2; x < W - inset - 2; x += 4) parts.push(px(x, y + 1, 1, 1, ['#D9534F', '#F5C84C', team, '#FFFFFF'][(x + t) % 4]));
  }
  // 照明塔(3 以上)
  if (f.stadium >= 3) for (const x of [10, W - 14]) parts.push(px(x + 1, 10, 2, 32, '#5D6E63'), px(x - 1, 8, 6, 4, '#FFF3B0'), px(x, 9, 4, 2, '#FFFFFF'));
  // スコアボード(4 以上)とチームの旗(5)
  if (f.stadium >= 4) parts.push(px(W / 2 - 14, 4, 28, 12, '#163225'), px(W / 2 - 12, 6, 24, 2, '#F5C84C'), px(W / 2 - 12, 10, 10, 1, '#EDEBE0'), px(W / 2 + 2, 10, 10, 1, '#EDEBE0'));
  if (f.stadium >= 5) for (const x of [W / 2 - 22, W / 2 + 20]) parts.push(px(x, 2, 1, 12, '#5D6E63'), px(x + 1, 2, 6, 4, team));
  // 外野のフェンス
  parts.push(px(0, 42, W, 3, team));
  // 芝生.練習場のレベルで,刈り込みの縞がきれいになる
  parts.push(px(0, 45, W, H - 45, '#4C8A5A'));
  const stripes = 2 + f.ground * 2;
  for (let i = 0; i < stripes; i++) if (i % 2) parts.push(px((W / stripes) * i, 45, W / stripes, H - 45, '#5A9967'));
  // 内野
  parts.push(`<path d="M${W / 2} 52 L${W / 2 + 26} 72 L${W / 2} 92 L${W / 2 - 26} 72Z" fill="#B9875A"/>`);
  parts.push(`<path d="M${W / 2} 60 L${W / 2 + 15} 72 L${W / 2} 84 L${W / 2 - 15} 72Z" fill="#5A9967"/>`);
  for (const [x, y] of [[W / 2, 53], [W / 2 + 24, 71], [W / 2, 90], [W / 2 - 25, 71]] as const) parts.push(px(x - 1, y - 1, 3, 3, '#FFFFFF'));
  parts.push(px(W / 2 - 2, 70, 4, 3, '#C79A6B'));
  // 医務室(白い建物に赤い十字),食堂(煙突),スカウト室(見張り台)
  if (f.clinic) { const h = 6 + f.clinic * 2; parts.push(px(4, 94 - h, 18, h, '#F4F4F0'), px(12, 96 - h, 2, 6, '#D9534F'), px(10, 98 - h, 6, 2, '#D9534F')); }
  if (f.canteen) { const h = 6 + f.canteen * 2; parts.push(px(W - 24, 94 - h, 20, h, '#E8C79A'), px(W - 20, 94 - h + 3, 4, 3, '#7FB3D6'), px(W - 10, 94 - h + 3, 4, 3, '#7FB3D6'), px(W - 8, 88 - h, 3, 6, '#8C5A3C')); }
  if (f.scout) { const h = 8 + f.scout * 3; parts.push(px(30, 94 - h, 2, h, '#7A5700'), px(36, 94 - h, 2, h, '#7A5700'), px(28, 92 - h, 12, 4, '#A86F1E')); }
  return `<svg class="stadium" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="本拠地の様子(スタジアムLv${f.stadium},練習場Lv${f.ground})">${parts.join('')}</svg>`;
}

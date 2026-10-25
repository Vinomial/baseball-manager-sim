/** 選手のドット絵の顔.選手の ID から,顔つきと髪をいつも同じに決める. */
import type { Player } from '../types';

const SKIN = ['#F5D3AF', '#EBBB92', '#D49C72', '#B27B56'];
const HAIR = ['#20150E', '#3F2615', '#161616', '#5E3D1F', '#6B4B2B'];
const JERSEY = ['#2B6A44', '#2C6EA3', '#B23A2E', '#7A5700', '#6A3FA0', '#2C8EA3', '#C2407F', '#4A5568'];

const hash = (n: number): number => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return (x ^ (x >>> 16)) >>> 0; };

/** size は表示の大きさ(px).jersey を渡すとユニフォームの色になる. */
export function avatar(p: Player, size = 34, jersey?: string): string {
  const h = hash(p.id);
  const skin = SKIN[h % SKIN.length];
  const old = p.age >= 33;
  const hair = old && (h >> 3) % 3 === 0 ? '#9A9A9A' : HAIR[(h >> 4) % HAIR.length];
  const cap = jersey ?? JERSEY[(h >> 8) % JERSEY.length];
  const style = (h >> 12) % 3;
  const eyes = 4 + ((h >> 14) % 2);
  const px = (x: number, y: number, w: number, hh: number, c: string) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${c}"/>`;
  const parts = [
    px(3, 1, 6, 2, cap), px(2, 3, 8, 1, cap),                       // 帽子
    px(3, 4, 6, 4, skin), px(2, 5, 1, 2, skin), px(9, 5, 1, 2, skin), // 顔と耳
    px(3, 4, 1, 1, hair), px(8, 4, 1, 1, hair),                     // もみあげ
    ...(style === 1 ? [px(3, 7, 6, 1, hair)] : style === 2 ? [px(4, 7, 4, 1, hair)] : []), // ひげ
    px(eyes, 5, 1, 1, '#1b1b1b'), px(12 - eyes - 1, 5, 1, 1, '#1b1b1b'), // 目
    px(5, 7, 2, 1, style === 0 ? '#9a4a3a' : skin),                  // 口
    px(2, 9, 8, 3, cap), px(5, 8, 2, 1, skin),                       // ユニフォーム
    px(5, 9, 2, 1, '#ffffff'),
  ].join('');
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges" role="img" aria-label="${p.name}の顔">${parts}</svg>`;
}

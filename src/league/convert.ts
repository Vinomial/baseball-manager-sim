/** コンバート(守備位置の転向).時間をかけて新しい守備位置を身につける. */
import { POS_NAME } from '../data/constants';
import type { Career, Player, Pos } from '../types';
import { clamp, rand } from '../util/random';
import { findPlayer } from './team';

const INF: Pos[] = ['一', '二', '三', '遊'];
const ALL: Pos[] = ['捕', '一', '二', '三', '遊', '左', '中', '右'];

/** 守備位置ごとの向き不向き(0〜100) */
export function suitability(p: Player, to: Pos): number {
  const w: Record<Pos, [number, number, number, number]> = {
    //  守備, パワー, ミート, 走力
    捕: [0.6, 0.2, 0.2, 0], 遊: [0.6, 0, 0.2, 0.2], 二: [0.55, 0, 0.2, 0.25], 三: [0.5, 0.3, 0.2, 0],
    一: [0.1, 0.5, 0.4, 0], 左: [0, 0.4, 0.3, 0.3], 中: [0.4, 0, 0.2, 0.4], 右: [0.35, 0.35, 0, 0.3],
  };
  const [f, pw, m, sp] = w[to];
  return Math.round(p.field * f + p.power * pw + p.meet * m + p.speed * sp);
}

export interface ConvertOption { to: Pos; weeks: number; score: number; chance: number; note: string; }

/** 転向にかかる週数.内野どうし,外野どうしは短く,捕手は長い. */
export function convertWeeks(from: Pos, to: Pos): number {
  if (from === '捕' || to === '捕') return 16;
  const g = (x: Pos) => (INF.includes(x) ? 0 : 1);
  return g(from) === g(to) ? 6 : 10;
}

/** 完了時にうまくいく確率 */
export const convertChance = (p: Player, to: Pos): number => clamp(0.55 + (suitability(p, to) - 50) / 100, 0.35, 0.97);

/** 転向できる守備位置を,向いている順に並べる */
export function convertOptions(p: Player): ConvertOption[] {
  if (p.role !== '野手') return [];
  const now = suitability(p, p.pos as Pos);
  return ALL.filter((x) => x !== p.pos && !p.alt?.includes(x)).map((to) => {
    const score = suitability(p, to);
    const d = score - now;
    return {
      to, weeks: convertWeeks(p.pos as Pos, to), score, chance: convertChance(p, to),
      note: d >= 3 ? '今の守備位置より向いています' : d >= -4 ? 'ほぼ同じくらい向いています' : '向き不向きがあります',
    };
  }).sort((a, b) => b.score - a.score);
}

export function startConvert(c: Career, pid: number, to: Pos): string | null {
  const u = c.teams.find((t) => t.user)!;
  const p = findPlayer(u, pid);
  if (!p) return '選手が見つかりません.';
  if (p.role !== '野手') return '投手はコンバートできません.';
  if (p.conv) return 'すでにコンバート中です.';
  p.conv = { to, left: convertWeeks(p.pos as Pos, to) };
  return null;
}

export function cancelConvert(p: Player): void { p.conv = null; }

/** 1 週ぶん進める.守備練習の週は進みが速い. */
export function tickConvert(c: Career, menu: string): void {
  const u = c.teams.find((t) => t.user)!;
  for (const p of u.players) {
    if (!p.conv) continue;
    p.conv.left -= menu === 'field' ? 2 : 1;
    if (p.conv.left > 0) continue;
    const to = p.conv.to;
    p.conv = null;
    if (rand() < convertChance(p, to)) {
      const from = p.pos as Pos;
      p.alt = [...(p.alt ?? []).filter((x) => x !== to && x !== from), from].slice(-2);
      p.pos = to;
      c.news.push(`${p.name}のコンバートが成功!${POS_NAME[to]}が本職になりました.`);
    } else {
      p.field = Math.max(5, p.field - 1);
      c.news.push(`${p.name}は${POS_NAME[to]}への転向に苦戦し,身につきませんでした.`);
    }
  }
}

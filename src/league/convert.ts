/** コンバート(守備位置の転向).時間をかけて新しい守備位置を身につける. */
import { POS_NAME } from '../data/constants';
import type { Career, Player, Pos } from '../types';
import { clamp, rand } from '../util/random';
import { addStory } from './story';
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
      addStory(c, p, `${POS_NAME[from]}から${POS_NAME[to]}へコンバートした.`);
    } else {
      p.field = Math.max(5, p.field - 1);
      c.news.push(`${p.name}は${POS_NAME[to]}への転向に苦戦し,身につきませんでした.`);
    }
  }
}

/* ===== コンバートのおすすめ(春季キャンプなどで出す) ===== */

export interface ConvertTip {
  pid: number;
  to: Pos;
  weeks: number;
  chance: number;
  /** 期待する効果(守備の落ち込みの解消など)の大きさ.大きいほどおすすめ. */
  gain: number;
  text: string;
}

/**
 * いまの先発と控えを見て,コンバートのおすすめを出す(最大 3 つ).
 * 1. 本職でない守備位置で出ている選手は,その位置に本職を変える
 * 2. 先発より,その守備位置に向いている控えがいれば,その位置に転向させる
 */
export function convertAdvice(c: Career): ConvertTip[] {
  const u = c.teams.find((t) => t.user)!;
  const tips: ConvertTip[] = [];
  const seen = new Set<number>();
  const inL = new Set(u.lineup.map((e) => e.pid));
  for (const e of u.lineup) {
    if (e.pos === '指') continue;
    const p = findPlayer(u, e.pid);
    if (!p || p.role !== '野手' || p.conv || seen.has(p.id)) continue;
    const pos = e.pos as Pos;
    // 1. 本職でない位置で出ている
    if (p.pos !== pos && !p.alt?.includes(pos)) {
      const now = suitability(p, p.pos as Pos), after = suitability(p, pos);
      tips.push({
        pid: p.id, to: pos, weeks: convertWeeks(p.pos as Pos, pos), chance: convertChance(p, pos), gain: 12 + Math.max(0, after - now) * 0.2,
        text: `${p.name}は本職が${POS_NAME[p.pos]}ですが,いま${POS_NAME[pos]}で出ています.${POS_NAME[pos]}に転向すると,守備の落ち込み(-12〜-35)がなくなります.`,
      });
      seen.add(p.id);
    }
  }
  // 2. 控えの転向で,穴を埋める
  for (const e of u.lineup) {
    if (e.pos === '指') continue;
    const pos = e.pos as Pos;
    const inc = findPlayer(u, e.pid);
    if (!inc) continue;
    for (const b of u.players) {
      if (b.role !== '野手' || inL.has(b.id) || b.conv || seen.has(b.id) || b.pos === pos || b.alt?.includes(pos)) continue;
      const gap = suitability(b, pos) - suitability(inc, pos);
      if (gap < 6) continue;
      tips.push({
        pid: b.id, to: pos, weeks: convertWeeks(b.pos as Pos, pos), chance: convertChance(b, pos), gain: gap,
        text: `控えの${b.name}(${POS_NAME[b.pos]},${b.age}歳)は,${POS_NAME[pos]}に向いています(適性${suitability(b, pos)}).${POS_NAME[pos]}の${inc.name}(適性${suitability(inc, pos)})より上で,競争を促せます.`,
      });
      seen.add(b.id);
    }
  }
  return tips.sort((a, b) => b.gain - a.gain).slice(0, 3);
}

/**
 * 選手の寸評.いまの能力・年齢・成長タイプ・今季の成績から,短い文章を作る.
 * 同じ選手なら何度見ても同じ文になる(乱数を使わない).隠れた上限の正確な値は使わない(伸びしろの大きさだけ).DOM に依存しない.
 */
import { LABEL, LEAGUES, POS_NAME } from '../data/constants';
import type { AttrKey, Player } from '../types';
import { keysOf, playerValue, roomWord } from './player';

/** いちばん高い能力と,いちばん低い能力 */
function bestWorst(p: Player): { best: AttrKey; second: AttrKey; worst: AttrKey } {
  const ks = [...keysOf(p)].sort((a, b) => p[b] - p[a]);
  return { best: ks[0], second: ks[1], worst: ks[ks.length - 1] };
}

/** 能力の組み合わせから見た,選手のタイプ */
function styleOf(p: Player): string {
  const { best, second } = bestWorst(p);
  if (p.role === '投手') {
    if (p.stam < 45) return best === 'velo' ? '力で押すリリーフ向きの投手' : 'リリーフ向きの投手';
    if (best === 'velo') return second === 'stam' ? '馬力のある本格派' : '速球で押す本格派';
    if (best === 'ctrl') return '制球で打たせて取る技巧派';
    return '長いイニングを投げられる先発型';
  }
  const pos = POS_NAME[p.pos as keyof typeof POS_NAME] ?? p.pos;
  const kind = best === 'power' ? '長打が魅力の' : best === 'meet' ? 'ミートのうまい' : best === 'speed' ? '足で魅せる' : '守備で光る';
  const also = p[second] >= p[best] - 4 ? `${LABEL[second]}も悪くない.` : '';
  return `${kind}${pos}.${also}`;
}

/** そのリーグでの立ち位置 */
function standing(p: Player, level: number): string {
  const d = playerValue(p) - LEAGUES[Math.max(0, Math.min(LEAGUES.length - 1, level))].base;
  return d >= 12 ? 'このリーグでは抜けた存在' : d >= 5 ? 'このリーグの主力級' : d >= -3 ? 'このリーグのレギュラー争いに加われる力' : 'このリーグではまだ力不足';
}

/** 年齢・成長タイプ・伸びしろから見た,これから */
function future(p: Player): string {
  const room = roomWord(p);
  if (p.age >= 34) return 'ここからは衰えとの戦いになる.';
  if (p.type === '早熟' && p.age >= 27) return 'そろそろ衰えに気をつけたい.';
  if (p.type === '晩成' && p.age <= 27) return room === 'なし' || room === '小' ? '伸びしろはあまり残っていない.' : '花開くのはこれから.';
  if (room === '大') return p.age <= 23 ? '伸びしろが大きく,数年後が楽しみ.' : '伸びしろはまだ大きい.';
  if (room === '中') return 'まだ伸びる余地がある.';
  if (room === '小') return '伸びしろは少なく,ほぼ完成形.';
  return '能力はほぼ上限で,ここからは経験で勝負.';
}

/** 今季の成績のひとこと */
function seasonLine(p: Player): string {
  const s = p.stats;
  if (!s.g) return '';
  if (p.role === '投手') {
    const era = s.outs ? ((s.r * 27) / s.outs).toFixed(2) : '-.--';
    return `今季は${s.g}登板 ${s.w}勝${s.l}敗 防御率${era}.`;
  }
  const avg = s.ab ? (s.h / s.ab).toFixed(3).replace(/^0/, '') : '.---';
  return `今季は${s.g}試合 打率${avg} ${s.hr}本塁打 ${s.rbi}打点.`;
}

/** 寸評(2〜3 文).level はその選手がいる階層 */
export function scoutReport(p: Player, level: number): string {
  const { best, worst } = bestWorst(p);
  const weak = p[worst] < 40 && worst !== best ? `${LABEL[worst]}は課題.` : '';
  const style = styleOf(p);
  return [`${style.endsWith('.') ? style : `${style}.`}${standing(p, level)}.${weak}`, `${p.age}歳の${p.type}型で,${future(p)}`, seasonLine(p)].filter(Boolean).join('');
}

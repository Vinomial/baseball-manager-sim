/** 疲労と怪我.DOM に依存しない. */
import { keysOf } from '../growth/player';
import type { Injury, Player, Team } from '../types';
import { clamp, pick, rand, ri } from '../util/random';

const MINOR = ['打撲', '軽い肉離れ', '捻挫', '腰の張り', '指の突き指'];
const MEDIUM = ['肉離れ', '肩の炎症', '足首の捻挫', '肘の違和感', '疲労骨折の疑い'];
const MAJOR = ['靭帯損傷', '骨折', '肩の故障', '肘の手術'];

export const isHurt = (p: Player): boolean => !!p.inj && p.inj.weeks > 0;

/** 難易度による怪我の起きやすさ(1 が標準).週の始めに設定する. */
let injuryScale = 1;
export const setInjuryScale = (v: number): void => { injuryScale = v; };

/** 怪我の程度を決める.軽い怪我がほとんどで,大怪我はまれ. */
export function newInjury(med = 0): Injury {
  const r = rand();
  let name: string, weeks: number, major = false;
  if (r < 0.7) { name = pick(MINOR); weeks = ri(1, 3); }
  else if (r < 0.95) { name = pick(MEDIUM); weeks = ri(4, 8); }
  else { name = pick(MAJOR); weeks = ri(10, 20); major = true; }
  // 医務室が整っているほど,治りが早い
  weeks = Math.max(1, Math.round(weeks * (1 - med * 0.08)));
  return { name, weeks, major };
}

/** 疲れがたまっているほど怪我をしやすい(1.0〜3.0 倍) */
export const fatigueRisk = (p: Player): number => 1 + clamp((p.fatigue - 45) / 30, 0, 2);

/**
 * 怪我の判定.p が怪我をしたら,その内容を設定して true を返す.
 * @param base 基本の確率
 * @param med 医務室のレベル
 */
export function maybeInjure(p: Player, base: number, med = 0): boolean {
  if (isHurt(p)) return false;
  if (rand() >= base * injuryScale * fatigueRisk(p) * (1 - med * 0.1)) return false;
  p.inj = newInjury(med);
  if (p.inj.major) {
    // 大怪我は,能力が少し落ちる
    for (const k of keysOf(p)) p[k] = Math.max(5, p[k] - ri(0, 3));
  }
  p.cond = Math.max(0, p.cond - 1);
  return true;
}

/** 1 週ぶん,怪我を治す.治ったら true. */
export function heal(p: Player, med = 0): boolean {
  if (!p.inj) return false;
  p.inj.weeks -= 1 + (med >= 3 ? 1 : 0) * (rand() < 0.3 ? 1 : 0);
  if (p.inj.weeks <= 0) { p.inj = null; return true; }
  return false;
}

/** チームの故障者 */
export const hurtPlayers = (t: Team): Player[] => t.players.filter(isHurt);

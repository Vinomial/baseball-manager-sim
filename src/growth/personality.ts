/** 選手の性格とやる気. */
import type { Career, Personality, Player } from '../types';
import { clamp } from '../util/random';
import { salaryOf } from './player';

export const PERS_KEYS: Personality[] = ['fighter', 'cool', 'pace', 'leader', 'sensitive'];

export const PERS: Record<Personality, { name: string; desc: string }> = {
  fighter: { name: '負けず嫌い', desc: '試合に出られないと不満がたまりやすい.競争で燃える.' },
  cool: { name: 'クール', desc: '浮き沈みが少なく,控えでも落ち着いている.' },
  pace: { name: 'マイペース', desc: '待遇や起用をあまり気にしない.' },
  leader: { name: 'リーダー', desc: 'チームのやる気を少し引き上げる.' },
  sensitive: { name: '繊細', desc: '負け試合や怪我で,気持ちが落ちやすい.' },
};

export const moraleLabel = (m: number): string => (m >= 80 ? '絶好調' : m >= 60 ? '良好' : m >= 35 ? 'ふつう' : m >= 15 ? '不満' : '退団を考えている');

/** やる気による,練習の伸びの倍率(0.88〜1.12) */
export const moraleGrowth = (p: Player): number => 0.88 + clamp(p.morale, 0, 100) * 0.0024;
/** やる気による,調子の上がりやすさ */
export const moraleCondBias = (p: Player): number => ((clamp(p.morale, 0, 100) - 50) / 100) * 0.4;

/** 1 週ぶん,やる気を動かす.won は,その週の勝敗(試合がなければ null). */
export function updateMorale(c: Career, won: boolean | null): void {
  const u = c.teams.find((t) => t.user)!;
  const starters = new Set<number>([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
  const leaders = Math.min(2, u.players.filter((p) => p.pers === 'leader').length);
  for (const p of u.players) {
    let d = (55 - p.morale) * 0.05 + leaders * 0.3;
    if (starters.has(p.id)) d += p.pers === 'cool' ? 1 : 2;
    else d -= { fighter: 3, sensitive: 2, leader: 1, cool: 0.5, pace: 0.5 }[p.pers];
    if (won === true) d += 1;
    if (won === false) d -= p.pers === 'sensitive' ? 2 : 1;
    if (p.salary < salaryOf(p) * 0.75) d -= 1.5;
    if (p.inj && p.inj.weeks > 0 && p.pers === 'sensitive') d -= 1;
    p.morale = clamp(p.morale + d, 0, 100);
  }
}

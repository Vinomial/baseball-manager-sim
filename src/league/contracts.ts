/** 契約更改.大きく年俸が上がる選手は,要求を出してくる. */
import type { Career, ContractAsk, Player } from '../types';
import { clamp, rand } from '../util/random';
import { payroll } from './finance';
import { findPlayer } from './team';

const userT = (c: Career) => c.teams.find((t) => t.user)!;

/** 契約更改のあと,要求の大きい選手を交渉待ちにする(年俸はいったん元のまま). */
export function collectAsks(c: Career, before: Map<number, number>): ContractAsk[] {
  const out: ContractAsk[] = [];
  for (const p of userT(c).players) {
    const old = before.get(p.id);
    if (old === undefined) continue;
    if (p.salary >= old * 1.4 && p.salary - old >= 60) {
      out.push({ pid: p.id, old, ask: p.salary });
      p.salary = old;
    }
  }
  return out;
}

/** 交渉待ちの年俸の増えるぶん */
export function pendingIncrease(c: Career): number {
  return (c.off?.contracts ?? []).reduce((s, a) => s + (a.ask - a.old), 0);
}

/** 来シーズンの年俸総額の見込み(交渉待ちを要求どおりに払う場合) */
export const projectedPayroll = (c: Career): number => payroll(userT(c)) + pendingIncrease(c);

/** 値切りが通る確率 */
export function bargainChance(p: Player): number {
  const base = 0.55 + (p.morale - 50) / 120;
  const adj = p.pers === 'fighter' ? -0.12 : p.pers === 'pace' ? 0.1 : p.pers === 'leader' ? 0.05 : 0;
  return clamp(base + adj, 0.15, 0.9);
}

/** 交渉する.結果の文章を返す. */
export function negotiate(c: Career, pid: number, mode: 'accept' | 'bargain'): string {
  const o = c.off;
  const a = o?.contracts?.find((x) => x.pid === pid);
  const p = findPlayer(userT(c), pid);
  if (!o || !a || !p) return '';
  o.contracts = o.contracts!.filter((x) => x !== a);
  if (mode === 'accept') {
    p.salary = a.ask; p.morale = clamp(p.morale + 5, 0, 100);
    return `${p.name}は要求どおり,年俸${a.ask}万円で契約しました.`;
  }
  if (rand() < bargainChance(p)) {
    p.salary = Math.round((a.ask * 0.85) / 10) * 10; p.morale = clamp(p.morale - 3, 0, 100);
    return `${p.name}は,年俸${p.salary}万円で納得しました.`;
  }
  p.salary = a.ask; p.morale = clamp(p.morale - 25, 0, 100);
  return `${p.name}は値切りに腹を立て,やる気を落としました.年俸は要求どおり${a.ask}万円です.`;
}

/** 交渉を終わらせないまま新シーズンに入ったとき,要求どおりに契約する */
export function settleAll(c: Career): void {
  const o = c.off;
  if (!o?.contracts) return;
  for (const a of o.contracts) { const p = findPlayer(userT(c), a.pid); if (p) p.salary = a.ask; }
  o.contracts = [];
}

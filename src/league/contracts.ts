/** 契約更改.大きく年俸が上がる選手は,要求を出してくる. */
import { MIN_FIELDERS, MIN_PITCHERS } from '../data/constants';
import { playerValue, salaryOf } from '../growth/player';
import { toStars } from '../growth/stars';
import type { Career, ContractAsk, Player } from '../types';
import { clamp, rand } from '../util/random';
import { spend } from './economy';
import { payroll } from './finance';
import { addStory } from './story';
import { toFreeAgent } from './world';
import { fielders, findPlayer, pitchersOf } from './team';

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

/* ===== 複数年契約とFA権 ===== */

/** 複数年契約の年俸(1 年あたり).長いほど割安だが,力が落ちても払い続ける. */
export function multiYearSalary(p: Player, years: number): number {
  const base = Math.max(p.salary, salaryOf(p));
  return Math.max(50, Math.round((base * (1 - 0.04 * (years - 1))) / 10) * 10);
}

export const extensionFee = (p: Player, years: number): number => Math.round(multiYearSalary(p, years) * 0.3 * years);

/** 複数年契約を結ぶ.できないときは理由を返す. */
export function extendContract(c: Career, pid: number, years: number): string | null {
  const p = findPlayer(userT(c), pid);
  if (!p) return '選手が見つかりません.';
  if (years < 2 || years > 3) return '契約は2〜3年です.';
  if ((p.years ?? 1) > 1) return 'すでに複数年契約です.';
  if (p.loan !== undefined) return '助っ人は複数年契約にできません.';
  const fee = extensionFee(p, years);
  if (c.funds < fee) return '資金が足りません(契約金が必要です).';
  spend(c, 'hire', fee);
  p.salary = multiYearSalary(p, years);
  p.years = years;
  p.morale = clamp(p.morale + 10, 0, 100);
  addStory(c, p, `${years}年契約を結んだ.`);
  return null;
}

/** FA権を行使して,チームを去りそうか.1 年契約で,力があり,やる気が低い選手. */
export const leavingRisk = (p: Player): boolean => (p.years ?? 1) <= 1 && p.loan === undefined && toStars(playerValue(p)) >= 3.5 && p.morale < 35;

/** 1 年の終わりに,FA権を行使した選手が去る.去った選手の名前を返す. */
export function departures(c: Career): string[] {
  const u = userT(c);
  const out: string[] = [];
  for (const p of [...u.players]) {
    if (!leavingRisk(p)) continue;
    if (p.role === '野手' && fielders(u).length <= MIN_FIELDERS) continue;
    if (p.role === '投手' && pitchersOf(u).length <= MIN_PITCHERS) continue;
    toFreeAgent(c, u, p);
    out.push(p.name);
  }
  return out;
}

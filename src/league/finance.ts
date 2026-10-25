/** 年俸,予算,監督の信頼度,予想勝率.DOM に依存しない. */
import { salaryOf } from '../growth/player';
import type { Career, Team } from '../types';
import { clamp, rand } from '../util/random';
import { ovr } from './team';

export const payroll = (t: Team): number => t.players.reduce((s, p) => s + p.salary, 0);

/** 年俸の表示.1億円以上は億で示す. */
export function fmtYen(man: number): string {
  return man >= 10000 ? `${(man / 10000).toFixed(man >= 100000 ? 0 : 1)}億円` : `${Math.round(man).toLocaleString('ja-JP')}万円`;
}

/** 前のシーズンの成績に応じた収入の倍率(0.85〜1.3).勝つほど予算が増える. */
export function revenueAfter(winPct: number, playoff: boolean, title: boolean, prev: number): number {
  const target = 1 + (winPct - 0.5) * 0.9 + (playoff ? 0.05 : 0) + (title ? 0.15 : 0);
  return clamp(prev * 0.4 + target * 0.6, 0.85, 1.3);
}

/** 信頼度が高いほど予算が多く,選手も来てくれる. */
export const trustBudgetFactor = (trust: number): number => 0.92 + trust * 0.0016;
/** 信頼度が高いほど練習の成長が大きい(0.9〜1.1 倍). */
export const trustGrowth = (trust: number): number => 0.9 + trust * 0.002;
/** 信頼度が高いほど調子が上がりやすい. */
export const trustCondBias = (trust: number): number => ((trust - 50) / 100) * 0.6;

/** 来シーズン(オフの間)または今シーズンのプレイヤーの予算.同じリーグの他チームの平均の年俸総額が目安. */
export function budgetFor(c: Career): number {
  const level = c.off ? c.off.to : c.level;
  const ai = c.teams.filter((t) => !t.user && (c.off ? c.off.next[t.id] : c.leagues.find((l) => l.teamIds.includes(t.id))?.level) === level);
  const avg = ai.length ? ai.reduce((s, t) => s + payroll(t), 0) / ai.length : payroll(c.teams.find((t) => t.user)!);
  return Math.round((avg * trustBudgetFactor(c.trust) * c.revenue) / 10) * 10;
}

/** 年俸をいまの力に合わせて更新する(契約更改). */
export function renewContracts(c: Career): void {
  // 急に上がりすぎ・下がりすぎないよう,1年の変化には幅を持たせる
  for (const t of c.teams) for (const p of t.players) p.salary = Math.max(50, Math.round(clamp(salaryOf(p), p.salary * 0.7, Math.max(p.salary * 1.6, 100)) / 10) * 10);
}

/* ===== 予想勝率 ===== */

/** 総合力の差から出した勝率.試合のシミュレーションに合わせて調整してある. */
export function winProb(a: Team, b: Team): number {
  return clamp(1 / (1 + Math.exp(-(ovr(a) - ovr(b)) / 4.4)), 0.03, 0.97);
}

export interface Forecast {
  /** 予想の最終勝数 */
  wins: number;
  /** 予想の順位ごとの確率(添え字 0 が 1 位) */
  rank: number[];
  /** 上位 MOVES チーム(昇格圏)の確率 */
  up: number;
  /** プレーオフ(上位4)の確率 */
  playoff: number;
  /** 下位(降格圏)の確率 */
  down: number;
}

/** 残りの試合を何度か作って,最終順位の見込みを出す. */
export function forecast(c: Career, runs = 250, moves = 2): Forecast {
  const lg = c.leagues[c.level];
  const ids = lg.teamIds;
  const teams = new Map(c.teams.filter((t) => ids.includes(t.id)).map((t) => [t.id, t]));
  const ov = new Map([...teams].map(([id, t]) => [id, ovr(t)]));
  const p = (a: number, b: number) => clamp(1 / (1 + Math.exp(-(ov.get(a)! - ov.get(b)!) / 4.4)), 0.03, 0.97);
  const rank = ids.map(() => 0);
  let wins = 0;
  for (let r = 0; r < runs; r++) {
    const w = new Map(ids.map((id) => [id, lg.stand[id].w + 0.5 * lg.stand[id].d]));
    for (let k = lg.week; k < lg.schedule.length; k++) {
      for (const [h, a] of lg.schedule[k]) {
        if (rand() < p(h, a)) w.set(h, w.get(h)! + 1); else w.set(a, w.get(a)! + 1);
      }
    }
    const order = [...ids].sort((x, y) => w.get(y)! - w.get(x)! || rand() - 0.5);
    rank[order.indexOf(c.userId)]++;
    wins += w.get(c.userId)!;
  }
  const pr = rank.map((n) => n / runs);
  const sum = (from: number, to: number) => pr.slice(from, to).reduce((s, v) => s + v, 0);
  return {
    wins: wins / runs, rank: pr, up: sum(0, moves), playoff: sum(0, 4), down: sum(ids.length - moves, ids.length),
  };
}

/* ===== 信頼度 ===== */

export const trustLabel = (t: number): string => (t >= 80 ? '厚い' : t >= 55 ? '安定' : t >= 30 ? 'ゆらぐ' : '解任の危機');

export function addTrust(c: Career, d: number): void {
  c.trust = clamp(c.trust + d, 0, 100);
}

/** 試合の結果による信頼度の変化.勝つと思われていた試合に勝つほど上がる. */
export function trustAfterGame(prob: number, us: number, them: number): number {
  const res = us > them ? 1 : us < them ? 0 : 0.5;
  return (res - prob) * 2.4;
}

/** 解任の判定 */
export function checkFired(c: Career, text: string): void {
  if (!c.fired && c.trust <= 0) c.fired = { season: c.season, text };
}


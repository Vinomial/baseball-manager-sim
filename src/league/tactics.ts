/**
 * チームの戦術.方針を決めると,試合の中身(本塁打,三振,盗塁,守り)と,合う選手の価値が変わる.
 * 効き目は「浸透度」(同じ戦術を続けるほど上がり,変えると下がる)と,選手の顔ぶれとの「噛み合い」で決まる.DOM に依存しない.
 */
import type { AttrKey, Career, Player, Team } from '../types';
import { clamp } from '../util/random';
import { estimated } from './advice';
import { leagueTeams } from './schedule';
import { findPlayer } from './team';

export type TacticKey = 'balance' | 'power' | 'speed' | 'contact' | 'defense';
type Fx = { hit: number; hr: number; k: number; dp: number; def: number; cmd: number };

export interface TacticDef {
  key: TacticKey;
  name: string;
  desc: string;
  /** 浸透度 100・噛み合い ふつうのときの試合の補正 */
  fx: Partial<Fx>;
  /** 盗塁を試みる多さの倍率 */
  run: number;
  /** 噛み合いを見る能力(野手は先発,投手は上位 5 人) */
  fit: AttrKey[];
}

export const TACTICS: TacticDef[] = [
  { key: 'balance', name: 'バランス', desc: '偏らない戦い方.補正はないが,浸透度も噛み合いも気にしなくてよい.', fx: {}, run: 1, fit: [] },
  { key: 'power', name: '強打', desc: '長打で一気に点を取る.本塁打が増えるが,三振も増え,足は使わない.', fx: { hr: 0.014, k: 0.02, hit: -0.004 }, run: 0.6, fit: ['power'] },
  { key: 'speed', name: '機動力', desc: '足でかき回す.盗塁と安打が増えるが,本塁打は減る.', fx: { hit: 0.006, hr: -0.006 }, run: 1.9, fit: ['speed'] },
  { key: 'contact', name: 'つなぐ野球', desc: '粘ってつなぐ.安打が増え三振が減るが,本塁打は減る.', fx: { hit: 0.011, k: -0.022, hr: -0.008 }, run: 1.1, fit: ['meet'] },
  { key: 'defense', name: '守り勝つ', desc: '守備と制球で失点を防ぐ.打線はやや控えめになる.', fx: { def: 3.5, cmd: 2.5, dp: 0.04, hit: -0.004 }, run: 0.9, fit: ['field', 'ctrl'] },
];
export const tacticDef = (k: TacticKey | undefined): TacticDef => TACTICS.find((t) => t.key === k) ?? TACTICS[0];

/** 戦術を変えた直後の浸透度 */
export const FAM_START = 20;
/** 公式戦のある週に上がる浸透度 */
export const FAM_WEEK = 4;

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** チームの,戦術に関わる能力の平均(野手は先発,投手は上位 5 人) */
function fitValue(t: Team, d: TacticDef): number {
  if (!d.fit.length) return 0;
  const bats = t.lineup.map((e) => findPlayer(t, e.pid)).filter((p): p is Player => !!p);
  const pits = t.pitchers.slice(0, 5).map((id) => findPlayer(t, id)).filter((p): p is Player => !!p);
  return avg(d.fit.map((k) => avg((k === 'velo' || k === 'ctrl' || k === 'stam' ? pits : bats).map((p) => p[k]))));
}

/** 噛み合い.リーグの他チームより戦術の能力が高いほど大きい(0.5〜1.5) */
export function tacticFit(c: Career, t: Team = c.teams.find((x) => x.user)!): number {
  const d = tacticDef(c.tactic);
  if (!d.fit.length) return 1;
  const others = leagueTeams(c).filter((x) => !x.user);
  const ref = avg(others.map((x) => fitValue(x, d)));
  return clamp(1 + (fitValue(t, d) - ref) / 30, 0.5, 1.5);
}

/** 効き目の大きさ(浸透度と噛み合い) */
export function tacticPower(c: Career): number {
  const fam = c.tacticFam ?? 100;
  return (0.3 + 0.7 * (fam / 100)) * tacticFit(c);
}

/** 試合の補正(監督の補正に足す)と,盗塁の倍率 */
export function tacticFx(c: Career): { fx: Fx; run: number } {
  const d = tacticDef(c.tactic), s = tacticPower(c);
  const fx: Fx = { hit: 0, hr: 0, k: 0, dp: 0, def: 0, cmd: 0 };
  for (const k of Object.keys(d.fx) as (keyof Fx)[]) fx[k] = (d.fx[k] ?? 0) * s;
  return { fx, run: 1 + (d.run - 1) * s };
}

/** 戦術を変える.浸透度は下がる(同じなら何もしない). */
export function setTactic(c: Career, k: TacticKey): void {
  if ((c.tactic ?? 'balance') === k) return;
  c.tactic = k;
  c.tacticFam = k === 'balance' ? 100 : FAM_START;
}

/** 浸透度を上げる(試合のある週,戦術研究のとき) */
export function addFam(c: Career, n: number): void {
  c.tacticFam = clamp((c.tacticFam ?? 100) + n, 0, 100);
}

/** ドラフト・自由契約で,戦術に合う選手に足す点(おすすめの順位用) */
export function tacticBonus(c: Career, p: Player): number {
  const d = tacticDef(c.tactic);
  const ks = d.fit.filter((k) => (p.role === '投手') === (k === 'velo' || k === 'ctrl' || k === 'stam'));
  if (!ks.length) return 0;
  const e = estimated(p);
  return Math.max(0, avg(ks.map((k) => e[k])) - 50) * 0.15;
}

/** いまの顔ぶれにいちばん噛み合う戦術(どれも合わなければバランス) */
export function bestTactic(c: Career): TacticKey {
  const keep = c.tactic;
  let best: TacticKey = 'balance', bv = 1.08;
  for (const d of TACTICS) {
    if (d.key === 'balance') continue;
    c.tactic = d.key;
    const f = tacticFit(c);
    if (f > bv) { bv = f; best = d.key; }
  }
  c.tactic = keep;
  return best;
}

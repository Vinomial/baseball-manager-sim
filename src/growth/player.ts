import { BAT_KEYS, FOREIGN_FIRST, FOREIGN_LAST, GIVEN_NAMES, PEAK, PIT_KEYS, POS, SURNAMES, TYPES } from '../data/constants';
import type { AttrKey, Player, Pos, Role, Stats } from '../types';
import { genAbilities } from './abilities';
import { PERS_KEYS } from './personality';
import { clamp, pick, rand, randn, ri } from '../util/random';

/** 新しい ID を払い出すもの(Career が該当) */
export interface IdSource { nid: number; }

export function emptyStats(): Stats {
  return { pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0, g: 0, outs: 0, r: 0, k: 0, w: 0, l: 0, ha: 0, bba: 0, d2: 0, t3: 0 };
}

export function keysOf(p: Player): AttrKey[] {
  return p.role === '野手' ? BAT_KEYS : PIT_KEYS;
}

export interface GenOpts {
  age?: number;
  pos?: Pos;
  /** 伸びしろの倍率 */
  potMul?: number;
  /** 外国人選手になる確率(省略すると,リーグの高さで決まる) */
  foreign?: number;
}

export function genPlayer(ids: IdSource, role: Role, base: number, opt: GenOpts = {}): Player {
  const age = opt.age ?? ri(18, 31);
  const zero = { meet: 0, power: 0, speed: 0, field: 0, velo: 0, ctrl: 0, stam: 0 };
  const p: Player = {
    id: ids.nid++,
    name: rand() < (opt.foreign ?? clamp((base - 38) / 90, 0, 0.5)) ? pick(FOREIGN_FIRST) + ' ' + pick(FOREIGN_LAST) : pick(SURNAMES) + ' ' + pick(GIVEN_NAMES),
    age,
    type: pick(TYPES),
    role,
    pos: role === '野手' ? (opt.pos ?? pick(POS)) : '投',
    cond: ri(1, 3),
    fatigue: 0,
    ...zero,
    pot: { ...zero },
    stats: emptyStats(),
    seasons: [],
    salary: 0,
    pitches: {},
    skills: [],
    pers: pick(PERS_KEYS),
    morale: 60,
  };
  const keys = keysOf(p);
  for (const k of keys) p[k] = clamp(Math.round(base + randn() * 7), 8, 95);
  // 守備位置ごとの特徴
  if (role === '野手') {
    if ('捕遊二'.includes(p.pos)) p.field = clamp(p.field + 6, 8, 95);
    if ('一左右'.includes(p.pos)) p.power = clamp(p.power + 6, 8, 95);
    if (p.pos === '中') p.speed = clamp(p.speed + 6, 8, 95);
  }
  const youth = age <= 22 ? 1 : age <= 26 ? 0.7 : age <= 29 ? 0.4 : 0.15;
  for (const k of keys) p.pot[k] = clamp(Math.round(p[k] + ri(4, 34) * youth * (opt.potMul ?? 1)), p[k], 99);
  genAbilities(p, base);
  p.salary = salaryOf(p);
  return p;
}

/** 年齢と成長タイプによる伸びやすさ */
export function ageFactor(p: Player): number {
  const [lo, hi] = PEAK[p.type];
  if (p.age < lo) return 0.9;
  if (p.age <= hi) return 1.25;
  return Math.max(0.1, 1.25 - (p.age - hi) * 0.3);
}

/**
 * 1能力を伸ばす.上限に近いほど伸びにくい.
 * @param mult 練習メニューごとの倍率
 */
export function growAttr(p: Player, k: AttrKey, mult: number): void {
  const room = p.pot[k] - p[k];
  // 上限は目安.超えても止まらず,超えたぶんだけ伸びにくくなる
  const rf = room <= 0 ? 0.12 / (1 + -room / 4) : Math.min(1, 0.25 + room / 14);
  p[k] = Math.min(99, p[k] + (0.7 + rand() * 1.6) * mult * ageFactor(p) * rf);
}

/** 調子の変動.bias が大きいほど上がりやすい. */
export function condDrift(p: Player, bias: number): void {
  const r = rand();
  if (r < 0.22 - bias * 0.15) p.cond--;
  else if (r > 0.78 - bias * 0.25) p.cond++;
  if (p.cond >= 4 && rand() < 0.3) p.cond--;
  if (p.cond <= 0 && rand() < 0.3) p.cond++;
  p.cond = clamp(p.cond, 0, 4);
}

/** 1年分の加齢.引退したら true を返す. */
export function agePlayer(p: Player): boolean {
  p.age++;
  const hi = PEAK[p.type][1] + 2;
  if (p.age > hi) {
    for (const k of keysOf(p)) {
      p[k] = Math.max(5, p[k] - rand() * 3 * (1 + (p.age - hi) * 0.3));
      p.pot[k] = Math.max(p[k], p.pot[k] - 1);
    }
  }
  return p.age >= 37 || (p.age >= 34 && rand() < 0.35);
}

/**
 * 1年に1度,上限が少しずつ動く.若いうちはゆらぎ,まれに「覚醒」して大きく伸びる.
 * 覚醒した能力を返す(なければ null).
 */
export function driftPot(p: Player): AttrKey | null {
  const ks = keysOf(p);
  if (p.age <= PEAK[p.type][1]) for (const k of ks) p.pot[k] = clamp(Math.round(p.pot[k] + randn() * 1.5), Math.ceil(p[k]), 99);
  if (p.age <= PEAK[p.type][1] + 2 && rand() < 0.04) {
    const k = pick(ks);
    p.pot[k] = clamp(p.pot[k] + ri(6, 12), Math.ceil(p[k]), 99);
    return k;
  }
  return null;
}

/** 伸びしろのおおまかな表示 */
export function roomWord(p: Player): string {
  const ks = keysOf(p);
  const r = ks.reduce((s, k) => s + Math.max(0, p.pot[k] - p[k]), 0) / ks.length;
  return r >= 18 ? '大' : r >= 8 ? '中' : r > 0.5 ? '小' : 'なし';
}

/** 試合で使う実効値(調子込み) */
/** 疲れがたまると,力が出なくなる */
export const tiredPenalty = (p: Player): number => Math.max(0, p.fatigue - 40) * 0.1;
export const eff = (p: Player, k: AttrKey): number => p[k] + (p.cond - 2) * 4 - tiredPenalty(p);

/** 今の力.野手は打撃と守備,投手は球威・制球・スタミナの重み付き平均. */
export function playerValue(p: Player): number {
  return p.role === '野手'
    ? p.meet * 0.35 + p.power * 0.3 + p.speed * 0.15 + p.field * 0.2
    : p.velo * 0.4 + p.ctrl * 0.35 + p.stam * 0.25;
}

/** 上限までの伸びしろ込みの力.若いほど伸びしろを重く見る. */
export function futureValue(p: Player): number {
  const keys = keysOf(p);
  const room = keys.reduce((s, k) => s + Math.max(0, p.pot[k] - p[k]), 0) / keys.length;
  const w = p.age <= 22 ? 0.55 : p.age <= 25 ? 0.4 : p.age <= 28 ? 0.2 : 0.05;
  return playerValue(p) + room * w;
}

/** 市場での年俸(万円).力が上がるほど急に高くなる. */
export function salaryOf(p: Player): number {
  return Math.max(50, Math.round((80 * Math.exp((playerValue(p) - 30) * 0.055)) / 10) * 10);
}

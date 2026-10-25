/** スカウトの派遣.ドラフトに出る注目選手を,前もって見つけておく. */
import { LEAGUES } from '../data/constants';
import { genPlayer, keysOf } from '../growth/player';
import type { Career, Player } from '../types';
import { clamp, ri } from '../util/random';
import { moneyScale } from './economy';

export const SCOUT_WEEKS = 3;
export const WATCH_MAX = 6;

export const scoutCost = (c: Career, type: '野手' | '投手' | '素質'): number =>
  Math.round((moneyScale(c) * 0.12 * (type === '素質' ? 1.5 : 1)) / 10) * 10;

/** スカウトを送り出す.できないときは理由を返す. */
export function dispatchScout(c: Career, type: '野手' | '投手' | '素質'): string | null {
  if (c.scout) return 'すでにスカウトが出ています.';
  if (c.watch.length >= WATCH_MAX) return `注目選手は${WATCH_MAX}人までです.`;
  const cost = scoutCost(c, type);
  if (c.funds < cost) return '資金が足りません.';
  c.funds -= cost;
  c.scout = { weeks: SCOUT_WEEKS, type };
  return null;
}

/** 注目選手を 1 人見つける.見積もりの幅は,通常のスカウトより狭い. */
export function findProspect(c: Career, type: '野手' | '投手' | '素質'): Player {
  const base = LEAGUES[c.level].base - 4;
  const role = type === '投手' ? '投手' : type === '野手' ? '野手' : ri(0, 2) === 0 ? '投手' : '野手';
  const p = genPlayer(c, role, base, { age: ri(18, 22), potMul: type === '素質' ? 1.1 : 0.8 });
  const err = Math.max(1, Math.round(ri(2, 5) * (1 - c.fac.scout * 0.15)));
  p.scout = {};
  for (const k of keysOf(p)) p.scout[k] = [clamp(Math.round(p[k] - ri(0, err)), 1, 99), clamp(Math.round(p[k] + ri(0, err)), 1, 99)];
  const ks = keysOf(p);
  const pot = ks.reduce((s, k) => s + p.pot[k], 0) / ks.length;
  p.scoutPot = [clamp(Math.round(pot - ri(0, err)), 1, 99), clamp(Math.round(pot + ri(0, err)), 1, 99)];
  p.watched = true;
  return p;
}

/** 1 週ぶん進める.戻ってきたら注目選手を連れてくる. */
export function tickScout(c: Career): void {
  if (!c.scout) return;
  c.scout.weeks--;
  if (c.scout.weeks > 0) return;
  const n = c.fac.scout >= 3 ? 2 : 1;
  const found: Player[] = [];
  for (let i = 0; i < n && c.watch.length < WATCH_MAX; i++) { const p = findProspect(c, c.scout.type); c.watch.push(p); found.push(p); }
  c.scout = null;
  if (found.length) c.news.push(`スカウトが戻りました.注目選手: ${found.map((p) => p.name).join(',')}.ドラフトで指名できます.`);
}

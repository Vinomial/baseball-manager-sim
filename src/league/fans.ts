/**
 * ファンと人気.勝つほど,スター選手がいるほど,優勝するほどファンが増え,収入と自由契約の選手の来やすさに効く.
 * 階層ごとに「市場の大きさ」があり,ファンの数をその大きさで割ったものが人気.DOM に依存しない.
 */
import { LEAGUES } from '../data/constants';
import { playerValue } from '../growth/player';
import type { Career } from '../types';
import { clamp } from '../util/random';

/** 階層ごとの市場の大きさ(人).ここまでファンがいれば,人気はふつう(1.0) */
export const MARKET = [300, 1_200, 4_000, 12_000, 50_000, 200_000];

export const market = (tier: number): number => MARKET[Math.min(MARKET.length - 1, Math.max(0, tier))];

/** いまのファンの数(古いセーブにはないので,市場の大きさから始める) */
export const fansOf = (c: Career): number => c.fans ?? market(c.level) * 0.6;

/** 人気(ファンの数 ÷ 市場の大きさ).0.2〜3 */
export const popularity = (c: Career): number => clamp(fansOf(c) / market(c.level), 0.2, 3);

/** 人気の呼び名 */
export function popularityLabel(v: number): string {
  return v >= 2 ? '大人気' : v >= 1.3 ? '人気' : v >= 0.8 ? 'ふつう' : v >= 0.5 ? 'まだまだ' : '無名';
}

/** 収入の倍率.人気がふつうで 1,最大 1.6 */
export const fanIncomeMult = (c: Career): number => clamp(0.6 + 0.4 * popularity(c), 0.68, 1.6);

/** 自由契約の選手から見た魅力の上乗せ */
export const fanAppeal = (c: Career): number => clamp((popularity(c) - 1) * 3, -2, 5);

const add = (c: Career, n: number): void => { c.fans = Math.max(50, Math.round(fansOf(c) + n)); };

/** 公式戦 1 試合のあと.勝てば増え,負ければ少し減る.ホームの勝ちと,大差や番狂わせは大きく増える. */
export function fansAfterGame(c: Career, win: boolean, home: boolean, margin: number, upset: boolean): void {
  const m = market(c.level);
  if (win) add(c, m * (0.01 + (home ? 0.006 : 0) + (margin >= 5 ? 0.004 : 0) + (upset ? 0.01 : 0)));
  else add(c, -fansOf(c) * 0.004);
}

/** 毎週.スター選手(その階層で飛び抜けた選手)がいると増え,人気が市場より高すぎると少しずつ戻る. */
export function weeklyFans(c: Career): string | null {
  const u = c.teams.find((t) => t.user)!;
  const star = LEAGUES[c.level].base + 14;
  const stars = u.players.filter((p) => playerValue(p) >= star).length;
  const m = market(c.level);
  add(c, m * 0.002 * Math.min(4, stars) - Math.max(0, fansOf(c) - m * 2) * 0.01);
  return null;
}

/** 優勝などの大きな出来事 */
export function fansBoost(c: Career, kind: 'title' | 'cup' | 'promo' | 'event'): void {
  const m = market(c.level);
  add(c, kind === 'title' ? m * 0.35 : kind === 'cup' ? m * 0.25 : kind === 'promo' ? m * 0.1 : m * 0.05);
}

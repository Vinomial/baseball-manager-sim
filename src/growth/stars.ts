/** 星(★)の評価.能力値を,1〜5 の星(0.5 きざみ)にして,ひと目で分かるようにする. */
import type { Player } from '../types';
import { clamp } from '../util/random';
import { futureValue, playerValue } from './player';

/** 20 前後で星 1,35 前後で星 2,…,85 で星 5.リーグをまたいで同じ物差し. */
export const toStars = (v: number): number => clamp(Math.round(((v - 15) / 14) * 2) / 2, 0.5, 5);

export const ovrStars = (p: Player): number => toStars(playerValue(p));
/** 将来性(伸びしろ込みの力).いまの力より低くはならない. */
export const potStars = (p: Player): number => Math.max(ovrStars(p), toStars(futureValue(p)));

/** 実績.条件を満たすと解除され,知らせが出る. */
import { LEAGUES } from '../data/constants';
import type { BoxBat } from '../engine/recap';
import type { Career, Game } from '../types';
import { careerStats } from './leaders';

export interface Ach { id: string; name: string; desc: string; }

export const ACHIEVEMENTS: Ach[] = [
  { id: 'first_win', name: '初勝利', desc: '最初の1勝をあげる' },
  { id: 'streak5', name: '5連勝', desc: '5連勝する' },
  { id: 'streak10', name: '10連勝', desc: '10連勝する' },
  { id: 'shutout', name: '完封勝ち', desc: '相手を0点に抑えて勝つ' },
  { id: 'nohit', name: 'ノーヒッター', desc: '相手をノーヒットに抑えて勝つ' },
  { id: 'bigwin', name: '大勝', desc: '10点差以上で勝つ' },
  { id: 'twohr', name: '2発', desc: '1人の選手が1試合に2本塁打' },
  { id: 'rival', name: '宿敵撃破', desc: 'ライバルに初めて勝つ' },
  { id: 'wins100', name: '通算100勝', desc: 'チームで通算100勝' },
  { id: 'wins500', name: '通算500勝', desc: 'チームで通算500勝' },
  { id: 'up1', name: '社会人へ', desc: '社会人リーグに昇格する' },
  { id: 'up2', name: '独立リーグへ', desc: '独立リーグに昇格する' },
  { id: 'up3', name: 'プロ入り', desc: 'プロリーグに昇格する' },
  { id: 'title0', name: '草野球の王者', desc: '草野球リーグで優勝する' },
  { id: 'title1', name: '社会人の王者', desc: '社会人リーグで優勝する' },
  { id: 'title2', name: '独立の王者', desc: '独立リーグで優勝する' },
  { id: 'title3', name: 'プロの王者', desc: 'プロリーグで優勝する' },
  { id: 'threepeat', name: 'プロ3連覇', desc: 'プロリーグで3連覇する' },
  { id: 'perfect', name: '完全優勝', desc: '1シーズンを負けなしで終える' },
  { id: 'seasons10', name: '10シーズン', desc: '10シーズン指揮をとる' },
  { id: 'seasons25', name: '25シーズン', desc: '25シーズン指揮をとる' },
  { id: 'hr100', name: '100本塁打', desc: '自チームの選手が通算100本塁打' },
  { id: 'h500', name: '500安打', desc: '自チームの選手が通算500安打' },
  { id: 'w50', name: '通算50勝', desc: '自チームの投手が通算50勝' },
  { id: 'k500', name: '500奪三振', desc: '自チームの投手が通算500奪三振' },
  { id: 'mvp', name: 'MVP輩出', desc: '自チームの選手がリーグMVPになる' },
  { id: 'fa', name: '補強', desc: '自由契約の選手を初めて獲得する' },
  { id: 'hall', name: '殿堂入り', desc: 'プロリーグで通算5回優勝する' },
];

export const PRO_TITLES_FOR_HALL = 5;

function unlock(c: Career, id: string): void {
  if (c.ach[id] !== undefined) return;
  c.ach[id] = c.season;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) c.news.push(`実績解除: ${a.name}`);
}

/** 試合のあとの実績 */
export function checkGame(c: Career, g: Game, oppId: number, boxes: BoxBat[]): void {
  const us = g.home.team.user ? g.home : g.away, them = us === g.home ? g.away : g.home;
  const win = us.runs > them.runs;
  if (win) {
    unlock(c, 'first_win');
    if (them.runs === 0) unlock(c, 'shutout');
    if (them.hits === 0) unlock(c, 'nohit');
    if (us.runs - them.runs >= 10) unlock(c, 'bigwin');
    if (c.rival === oppId) unlock(c, 'rival');
  }
  if (c.rec.bestStreak >= 5) unlock(c, 'streak5');
  if (c.rec.bestStreak >= 10) unlock(c, 'streak10');
  if (boxes.some((b) => b.hr >= 2)) unlock(c, 'twohr');
  if (c.rec.total.w >= 100) unlock(c, 'wins100');
  if (c.rec.total.w >= 500) unlock(c, 'wins500');
}

/** シーズンの終わりの実績.userTitle: プレイヤーが優勝したか. */
export function checkSeason(c: Career, level: number, userTitle: boolean, perfect: boolean, moved: number): void {
  if (userTitle) unlock(c, `title${level}`);
  if (perfect) unlock(c, 'perfect');
  if (moved > 0) unlock(c, `up${level + 1}`);
  if (c.season >= 10) unlock(c, 'seasons10');
  if (c.season >= 25) unlock(c, 'seasons25');
  if (c.rec.proStreak >= 3) unlock(c, 'threepeat');
  if (c.rec.titles[3] >= PRO_TITLES_FOR_HALL) unlock(c, 'hall');
  const u = c.teams.find((t) => t.user)!;
  let hr = 0, h = 0, w = 0, k = 0;
  for (const p of u.players) {
    const s = careerStats(p, false);
    hr = Math.max(hr, s.hr); h = Math.max(h, s.h); w = Math.max(w, s.w); k = Math.max(k, s.k);
  }
  if (hr >= 100) unlock(c, 'hr100');
  if (h >= 500) unlock(c, 'h500');
  if (w >= 50) unlock(c, 'w50');
  if (k >= 500) unlock(c, 'k500');
  if (c.awards.some((a) => a.season === c.season && a.kind === 'MVP' && a.mine)) unlock(c, 'mvp');
}

export function checkFA(c: Career): void { unlock(c, 'fa'); }

/** プロリーグでの目標.進み具合を返す. */
export function goals(c: Career): { name: string; now: number; max: number; done: boolean }[] {
  const t = c.rec.titles;
  return [
    { name: 'プロリーグに昇格する', now: c.level >= 3 || c.ach['up3'] ? 1 : 0, max: 1, done: !!c.ach['up3'] },
    { name: 'プロリーグで初優勝', now: Math.min(1, t[3]), max: 1, done: t[3] >= 1 },
    { name: 'プロリーグで3連覇', now: Math.min(3, c.rec.proStreak), max: 3, done: !!c.ach['threepeat'] },
    { name: `プロリーグ通算${PRO_TITLES_FOR_HALL}回優勝で殿堂入り`, now: Math.min(PRO_TITLES_FOR_HALL, t[3]), max: PRO_TITLES_FOR_HALL, done: t[3] >= PRO_TITLES_FOR_HALL },
  ];
}

export const titleCount = (c: Career): number => c.rec.titles.reduce((a, b) => a + b, 0);
export const leagueTitle = (l: number): string => `${LEAGUES[l].name}優勝`;

/**
 * ドラフト 1 巡目の入札.全チームが同時に 1 人を指名し,重なったら抽選で交渉権を決める.
 * 外れたチームは,残りの選手でもう一度入札する(外れ 1 位).2 巡目からはいつもの順番で指名する.DOM に依存しない.
 */
import { DRAFT_ROUNDS } from '../data/constants';
import { keysOf } from '../growth/player';
import type { Career, DraftState, Player, Team } from '../types';
import { pick, randn } from '../util/random';
import { teamById } from './schedule';
import { addStory } from './story';
import { advanceDraft, draftScore, pressNote, takePick } from './world';

/** 目玉選手への人気の上乗せ(大きいほど競合が集まる) */
const STAR_PULL = 3;

/** 本当の伸びしろ(能力の上限の平均) */
const truePot = (p: Player): number => keysOf(p).reduce((s, k) => s + p.pot[k], 0) / keysOf(p).length;

/** 入札を始める.目玉選手(伸びしろの上位 3 人)を決め,1 巡目の指名を入札にする. */
export function startLottery(c: Career, d: DraftState): void {
  d.stars = [...d.pool].sort((a, b) => truePot(b) - truePot(a)).slice(0, 3).map((p) => p.id);
  const teams = d.order.slice(0, d.order.length / DRAFT_ROUNDS);
  d.lottery = { teams, won: {}, log: [], wave: 1, done: false, userLost: false };
  void c;
}

export const lotteryOpen = (d: DraftState): boolean => !!d.lottery && !d.lottery.done;

const taken = (d: DraftState): Set<number> => new Set(Object.values(d.lottery?.won ?? {}));

/** AI チームが入札する選手.目玉選手には人気が集まる. */
function aiBid(d: DraftState, t: Team): Player | null {
  const used = taken(d);
  const cands = d.pool.filter((p) => !used.has(p.id));
  if (!cands.length) return null;
  return cands.map((p) => ({ p, v: draftScore(t, p) + (d.stars?.includes(p.id) ? STAR_PULL : 0) + randn() * 5 })).sort((a, b) => b.v - a.v)[0].p;
}

/** 競合の予想: その選手を 1 位にしそうな AI チームの数(ぶれを入れずに見る) */
export function expectedBids(c: Career, d: DraftState, p: Player): number {
  if (!d.lottery) return 0;
  const used = taken(d);
  const cands = d.pool.filter((x) => !used.has(x.id));
  let n = 0;
  for (const id of d.lottery.teams) {
    if (id === c.userId || d.lottery.won[id] !== undefined) continue;
    const t = teamById(c, id);
    const best = cands.reduce((a, b) => ((draftScore(t, b) + (d.stars?.includes(b.id) ? STAR_PULL : 0)) > (draftScore(t, a) + (d.stars?.includes(a.id) ? STAR_PULL : 0)) ? b : a));
    if (best === p) n++;
  }
  return n;
}

/** 1 回分の入札をまとめて抽選する.choice はプレイヤーの入札(null なら見送り,プレイヤーが入札しない回は undefined). */
function wave(c: Career, d: DraftState, choice: Player | null | undefined): void {
  const L = d.lottery!;
  const bids = new Map<number, number[]>();
  for (const id of L.teams) {
    if (L.won[id] !== undefined) continue;
    let p: Player | null | undefined;
    if (id === c.userId) {
      if (choice === undefined) continue;
      p = choice;
      if (p === null) { L.won[id] = -1; continue; }
    } else p = aiBid(d, teamById(c, id));
    if (!p) { L.won[id] = -1; continue; }
    bids.set(p.id, [...(bids.get(p.id) ?? []), id]);
  }
  L.userLost = false;
  for (const [pid, teams] of bids) {
    const p = d.pool.find((x) => x.id === pid)!;
    const winner = teams.length > 1 ? pick(teams) : teams[0];
    L.won[winner] = pid;
    if (teams.length > 1) {
      L.log.push(`${L.wave === 1 ? '' : '外れ1位 '}${p.name}に${teams.length}球団が競合 → 抽選で${teamById(c, winner).name}が交渉権を獲得${teams.includes(c.userId) ? (winner === c.userId ? '!' : '(あなたは外れ)') : ''}`);
      if (teams.includes(c.userId) && winner !== c.userId) L.userLost = true;
    } else if (winner === c.userId) L.log.push(`${p.name}を単独で指名し,交渉権を獲得!`);
  }
  L.wave++;
}

/** すべてのチームの 1 位が決まったら,指名の順に入団させ,2 巡目へ進む */
function closeLottery(c: Career, d: DraftState): void {
  const L = d.lottery!;
  L.done = true;
  for (const id of L.teams) {
    const pid = L.won[id];
    const t = teamById(c, id);
    if (pid === undefined || pid < 0) { d.idx++; continue; }
    const p = d.pool.find((x) => x.id === pid);
    if (!p) { d.idx++; continue; }
    if (t.user) {
      c.off?.press?.push(pressNote(p));
      addStory(c, p, d.stars?.includes(p.id) ? 'ドラフト1位(目玉選手)で入団した.' : 'ドラフト1位で入団した.');
    }
    takePick(c, d, t, p);
  }
  advanceDraft(c, d);
}

/**
 * プレイヤーが 1 位を入札する(null なら見送り).抽選に外れたら,もう一度入札を待つ.
 * プレイヤーが決まったら,AI チームの外れ 1 位を最後まで進めて,2 巡目へ.
 */
export function lotteryBid(c: Career, d: DraftState, p: Player | null): void {
  const L = d.lottery;
  if (!L || L.done || L.won[c.userId] !== undefined) return;
  wave(c, d, p);
  if (L.won[c.userId] === undefined && L.userLost) return;
  for (let i = 0; i < 20 && L.teams.some((id) => L.won[id] === undefined); i++) wave(c, d, undefined);
  closeLottery(c, d);
}

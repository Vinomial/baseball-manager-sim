/**
 * 昇格プレーオフと,昇格・降格.DOM に依存しない.
 *
 * - どの階層も,各リーグの上位 2 チームが 11 月の「昇格プレーオフ」に出る(草野球は 4 リーグで 8 チーム,ほかは 2 リーグで 4 チーム).
 * - 1 回戦に勝ったチームが,1 つ上の階層へ上がる.勝ち残ったチームは,その階層の優勝を争う.
 * - 上の階層からは,同じ数だけ,各リーグの下位から下がる.
 * - 最上位(メジャー)のプレーオフは,世界一を決めるだけ.
 */
import { LEAGUES, PO_PER_GROUP, promoCount, relegPerLeague } from '../data/constants';
import type { Career, Game, Team, TierPlayoff } from '../types';
import { poEntrants, poRoundAt, poRoundName, poRounds, poWins } from './calendar';
import { seriesWinProb } from './playoffs';
import { winProb } from './finance';
import { groupName, groupsInTier, groupStandings, teamById, type StandingRow } from './schedule';
import { playSeriesGen, type MomentGen } from './world';

const TOP = LEAGUES.length - 1;
const pctOf = (r: StandingRow): number => (r.w + r.l ? r.w / (r.w + r.l) : 0);

/**
 * 昇格プレーオフの組み合わせ.各リーグの 1 位と,別のリーグの 2 位が 1 回戦で当たる.
 * 1 位どうしは,なるべく決勝まで当たらないように表の上下に分ける.
 */
export function poSeeds(c: Career, tier: number): number[] {
  const gs = groupsInTier(c, tier).map((g) => groupStandings(c, g).slice(0, PO_PER_GROUP).map((r) => r.t.id));
  if (gs.some((g) => g.length < PO_PER_GROUP)) return [];
  const n = gs.length;
  // リーグが 1 つだけなら,上位 4 チーム(1 位対 4 位,2 位対 3 位)
  if (n === 1) {
    const t4 = groupStandings(c, groupsInTier(c, tier)[0]).slice(0, 4).map((r) => r.t.id);
    return t4.length === 4 ? [t4[0], t4[3], t4[1], t4[2]] : [];
  }
  const top: number[] = [], bottom: number[] = [];
  for (let i = 0; i < n; i += 2) top.push(gs[i][0], gs[(i + 1) % n][1]);
  for (let i = 1; i < n; i += 2) bottom.push(gs[i][0], gs[i - 1][1]);
  return [...top, ...bottom];
}

/** 昇格プレーオフを始める(リーグ戦がすべて終わってから) */
export function startTierPlayoffs(c: Career): void {
  c.tpo = [];
  for (let tier = 0; tier < LEAGUES.length; tier++) {
    const seeds = poSeeds(c, tier);
    if (seeds.length >= 4) c.tpo.push({ level: tier, seeds, wins: [], champion: null, runnerUp: null });
  }
}

export const tierPO = (c: Career, tier: number): TierPlayoff | null => c.tpo?.find((x) => x.level === tier) ?? null;

/** 今シーズンの順位(リーグの中の順位と勝率).プレーオフの上位側を決めるのに使う */
function seedRank(c: Career, tp: TierPlayoff, id: number): number {
  const i = tp.seeds.indexOf(id);
  // 表の偶数番目が 1 位,奇数番目が 2 位.同じ順位なら勝率の高い方
  const g = groupsInTier(c, tp.level).find((x) => x.ids.includes(id));
  const row = g ? groupStandings(c, g).find((r) => r.t.id === id) : undefined;
  return (i % 2) * 10 - (row ? pctOf(row) : 0);
}

/** 今週の回戦を,すべての階層で行う.プレイヤーが出た試合(実況付き)を返す. */
export function* playTierPlayoffWeekGen(c: Career): MomentGen<Game[]> {
  const out: Game[] = [];
  for (const tp of c.tpo ?? []) {
    const r = poRoundAt(tp, c.cal);
    if (r < 0 || tp.wins[r]) continue;
    const ents = poEntrants(tp, r);
    const ws: number[] = [];
    for (let i = 0; i < ents.length; i += 2) {
      const a = ents[i], b = ents[i + 1];
      if (a === null || b === null) { ws.push((a ?? b)!); continue; }
      const [hi, lo] = seedRank(c, tp, a) <= seedRank(c, tp, b) ? [a, b] : [b, a];
      const res = yield* playSeriesGen(c, teamById(c, hi), teamById(c, lo), poWins(tp.seeds.length, r));
      out.push(...res.games);
      ws.push(res.winner.id);
      if (ents.length === 2) {
        tp.champion = res.winner.id;
        tp.runnerUp = res.winner.id === hi ? lo : hi;
        c.champs.push({ season: c.season, level: tp.level, league: LEAGUES[tp.level].name, team: teamById(c, tp.champion).name, teamId: tp.champion, runnerUp: teamById(c, tp.runnerUp).name });
      }
    }
    tp.wins[r] = ws;
  }
  return out;
}

/** 階層の優勝チーム(まだ決まっていなければ null) */
export const tierChampion = (c: Career, tier: number): number | null => tierPO(c, tier)?.champion ?? null;

/**
 * 階層 tier から上がるチーム.昇格プレーオフの 1 回戦の勝者.
 * プレーオフがない(古いセーブなど)ときは,各リーグの 1 位.
 */
export function promotedFrom(c: Career, tier: number): number[] {
  if (tier >= TOP) return [];
  const tp = tierPO(c, tier);
  if (tp?.wins[0]?.length) return tp.wins[0];
  return groupsInTier(c, tier).map((g) => groupStandings(c, g)[0]?.t.id).filter((x): x is number => x !== undefined).slice(0, promoCount(tier));
}

/** 階層 tier から下がるチーム.各リーグの下位から,同じ数ずつ. */
export function relegatedFrom(c: Career, tier: number): number[] {
  if (tier <= 0) return [];
  const k = relegPerLeague(tier);
  return groupsInTier(c, tier).flatMap((g) => groupStandings(c, g).slice(-k).map((r) => r.t.id));
}

/** 全チームの来シーズンの階層 */
export function computeNextLevels(c: Career): Record<number, number> {
  const next: Record<number, number> = {};
  for (const lg of c.leagues) for (const id of lg.teamIds) next[id] = lg.level;
  for (let l = 0; l < TOP; l++) {
    const up = promotedFrom(c, l), down = relegatedFrom(c, l + 1);
    // 数が合わないとき(古いセーブなど)は,少ない方にそろえる
    const n = Math.min(up.length, down.length);
    for (const id of up.slice(0, n)) next[id] = l + 1;
    for (const id of down.slice(0, n)) next[id] = l;
  }
  return next;
}

/** 昇格・降格の知らせ(オフシーズンの画面用) */
export function moveTexts(c: Career): string[] {
  const out: string[] = [];
  for (let l = 0; l < TOP; l++) {
    const up = promotedFrom(c, l), down = relegatedFrom(c, l + 1);
    const n = Math.min(up.length, down.length);
    if (!n) continue;
    const names = (ids: number[]) => ids.slice(0, n).map((id) => teamById(c, id).name).join(',');
    out.push(`${LEAGUES[l].name}→${LEAGUES[l + 1].name}: ${names(up)} / ${LEAGUES[l + 1].name}→${LEAGUES[l].name}: ${names(down)}`);
  }
  return out;
}

/** 階層の決まりごと(順位表の上に出す説明).ロジックと同じ関数から数を出す. */
export function tierRuleText(c: Career, tier: number): string[] {
  const gs = groupsInTier(c, tier);
  const n = gs.length * PO_PER_GROUP;
  const lines: string[] = [];
  const where = gs.length > 1 ? `${gs.map((g) => groupName(g).split(' ').pop()).join('・')}の${gs.length}リーグ` : '1リーグ';
  if (LEAGUES[tier].divs) lines.push(`${LEAGUES[tier].name}は東西の2リーグに分かれ,同じリーグの相手と${LEAGUES[tier].rounds}回ずつ,もう一方のリーグと交流戦で${LEAGUES[tier].inter ?? 1}回ずつ戦います.`);
  else lines.push(`${LEAGUES[tier].name}は${where}です.`);
  lines.push(`各リーグの上位${PO_PER_GROUP}チーム(計${n}チーム)が,11月の昇格プレーオフに出ます.`);
  if (tier < TOP) lines.push(`${poRoundName(n, 0, true).replace('(昇格決定戦)', '')}に勝った${promoCount(tier)}チームが${LEAGUES[tier + 1].name}へ昇格.勝ち残ると${LEAGUES[tier].name}の優勝を争います.`);
  else lines.push('勝ち抜いたチームが,世界一です.');
  if (tier > 0) lines.push(`各リーグの下位${relegPerLeague(tier)}チームは,${LEAGUES[tier - 1].name}へ降格します.`);
  return lines;
}

/** 昇格プレーオフの各チームの,優勝する確率と(1 回戦がまだなら)昇格する確率 */
export function tierOdds(c: Career, tp: TierPlayoff): { team: Team; champion: number; promote: number }[] {
  const T = (id: number) => teamById(c, id);
  const R = poRounds(tp.seeds.length);
  const series = (a: number, b: number, w: number) => seriesWinProb(winProb(T(a), T(b)), w);
  // 回戦 r の i 番目の枠に,各チームが勝ち上がってくる確率
  const memo = new Map<string, Map<number, number>>();
  const slot = (r: number, i: number): Map<number, number> => {
    const key = `${r}:${i}`;
    if (memo.has(key)) return memo.get(key)!;
    let m: Map<number, number>;
    if (r === 0) m = new Map([[tp.seeds[i], 1]]);
    else if (tp.wins[r - 1]?.[i] !== undefined) m = new Map([[tp.wins[r - 1][i], 1]]);
    else {
      const L = slot(r - 1, 2 * i), Rr = slot(r - 1, 2 * i + 1);
      const w = poWins(tp.seeds.length, r - 1);
      m = new Map();
      for (const [a, pa] of L) for (const [b, pb] of Rr) {
        const pab = series(a, b, w);
        m.set(a, (m.get(a) ?? 0) + pa * pb * pab);
        m.set(b, (m.get(b) ?? 0) + pa * pb * (1 - pab));
      }
    }
    memo.set(key, m);
    return m;
  };
  const champ = slot(R, 0);
  const promoAll = new Map<number, number>();
  for (let i = 0; i < tp.seeds.length / 2; i++) for (const [id, p] of slot(1, i)) promoAll.set(id, p);
  return tp.seeds.map((id) => ({ team: T(id), champion: champ.get(id) ?? 0, promote: tp.level < TOP ? promoAll.get(id) ?? 0 : 0 }));
}

/** プレイヤーの昇格プレーオフの結果 */
export function poResultText(c: Career): string {
  const tp = tierPO(c, c.level), me = c.userId;
  if (!tp || !tp.seeds.includes(me)) return '昇格プレーオフには進めませんでした.';
  if (tp.champion === me) return `昇格プレーオフを勝ち抜き,${LEAGUES[c.level].name}で優勝!`;
  if (tp.runnerUp === me) return `昇格プレーオフの決勝で敗れ,準優勝でした.${c.level < TOP ? '昇格は決めています.' : ''}`;
  if (c.level < TOP) return tp.wins[0]?.includes(me) ? '昇格プレーオフの1回戦に勝ち,昇格を決めました.' : '昇格プレーオフの1回戦で敗れ,昇格はなりませんでした.';
  return '昇格プレーオフの準決勝で敗れました.';
}

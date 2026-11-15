/**
 * バランス確認用の「上手なプレイヤー」ボット.
 * ゲームのおすすめ(練習,ドラフト,自由契約)に従い,出来事に答え,料理を作り,施設とスタッフにお金を使う.
 * 古いコミットでも動くように,昔からある関数だけを使う.
 */
import { recommendedMenu } from '../src/league/autoplay';
import { advise } from '../src/league/advice';
import { canCook, cook, RECIPES } from '../src/growth/meals';
import { FACILITIES, MAX_FAC, upgrade, upgradeCost } from '../src/league/economy';
import { resolveEvent } from '../src/league/events';
import { budgetFor, payroll } from '../src/league/finance';
import { newSeason, pickDraft, playWeek, releasePlayer, signFreeAgent, userRosterMax, userTeam } from '../src/league/season';
import { hireStaff, signingBonus } from '../src/league/staff';
import { autoLineup, autoPitchers } from '../src/league/team';
import { confirmMessage } from '../src/league/warnings';
import { faVerdict } from '../src/league/world';
import { futureValue } from '../src/growth/player';
import type { Career } from '../src/types';

/** 施設を強くする順(練習場とスタジアムを先に) */
const FAC_ORDER = ['ground', 'stadium', 'canteen', 'clinic', 'scout'] as const;

/** 料理の大まかな価値: 伸びの増えた分 × 週数 */
const mealValue = (r: (typeof RECIPES)[number]): number =>
  Object.values(r.mult).reduce((s, v) => s + Math.max(0, (v ?? 1) - 1), 0) * r.weeks + ((r as { recover?: number }).recover ?? 0) * 0.02;

/** 1 週ぶん,上手なプレイヤーのように進める */
export function botWeek(c: Career): void {
  c.auto.lineup = true;
  c.auto.mode = 'form';
  if (c.event) resolveEvent(c, c.event.choices[0].key);
  if (!c.meal) {
    const best = RECIPES.filter((r) => canCook(c, r)).sort((a, b) => mealValue(b) - mealValue(a))[0];
    if (best) cook(c, best.key);
  }
  // 運転資金を少し残して,施設を強くする
  for (const k of FAC_ORDER) {
    if (c.fac[k] >= MAX_FAC) continue;
    if (c.funds > upgradeCost(c, k) * 1.4) upgrade(c, k);
  }
  let menu = recommendedMenu(c) as string;
  if (confirmMessage(c, menu, false)) menu = 'rest';
  playWeek(c, menu as Parameters<typeof playWeek>[1]);
}

/** オフ: おすすめどおりにドラフト,自由契約,放出を行い,空いているスタッフを雇って,次のシーズンへ */
export function botOffseason(c: Career): void {
  const u = userTeam(c);
  while (!c.off!.draft.done) {
    const d = c.off!.draft;
    const adv = advise(u, d.pool);
    const i = d.pool.findIndex((p) => adv.get(p.id)?.star);
    pickDraft(c, i >= 0 ? i : 0);
  }
  const cands = advise(u, c.fa.filter((p) => faVerdict(c, p) === 'ok' && p.salary <= budgetFor(c) - payroll(u)));
  for (const id of [...cands.entries()].filter(([, a]) => a.star).map(([id]) => id)) {
    if (u.players.length < userRosterMax(c)) signFreeAgent(c, id);
  }
  const core = new Set<number>([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
  while (u.players.length > userRosterMax(c)) {
    const rest = u.players.filter((p) => !core.has(p.id)).sort((a, b) => futureValue(a) - futureValue(b));
    if (!rest.length || releasePlayer(c, rest[0].id)) break;
  }
  for (let i = 0; i < 20 && payroll(u) > budgetFor(c); i++) {
    const rest = u.players.filter((p) => !core.has(p.id)).sort((a, b) => b.salary - a.salary);
    if (!rest.some((p) => !releasePlayer(c, p.id))) break;
  }
  // 空いている役職に,払える範囲でいちばん腕のいいスタッフを雇う
  for (const s of [...c.staffPool].sort((a, b) => b.skill - a.skill)) {
    if (c.staff[s.role]) continue;
    if (c.funds > signingBonus(s) * 3) hireStaff(c, s.id);
  }
  autoLineup(u);
  autoPitchers(u);
  if (c.fired) return;
  newSeason(c);
}

export interface PaceResult {
  /** 各リーグに初めて上がったシーズン(上がれなければ null) */
  reach: (number | null)[];
  /** メジャーで初めて優勝したシーズン */
  topTitle: number | null;
  fired: boolean;
  seasons: number;
}

/** 1 回分,最大 maxSeasons まで進めて,到達の記録をとる */
export function runPace(c: Career, maxSeasons: number, tiers: number): PaceResult {
  const reach: (number | null)[] = Array.from({ length: tiers }, (_, i) => (i === 0 ? 1 : null));
  let topTitle: number | null = null;
  for (let s = 1; s <= maxSeasons; s++) {
    while (c.phase === 'season' && !c.fired) botWeek(c);
    if (c.fired) return { reach, topTitle, fired: true, seasons: s };
    const o = c.off!;
    if (o.from === tiers - 1 && o.playoff.includes('優勝') && topTitle === null) topTitle = s;
    if (reach[o.to] === null) reach[o.to] = s + 1;
    if (topTitle !== null) return { reach, topTitle, fired: false, seasons: s };
    botOffseason(c);
    if (c.fired) return { reach, topTitle, fired: true, seasons: s };
  }
  return { reach, topTitle, fired: false, seasons: maxSeasons };
}

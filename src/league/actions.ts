/**
 * 月ごとの方針と,GM の行動枠.月のはじめに練習の方針を決め,行動を枠の数だけ選ぶ.
 * 行動はすぐに効く.全部はできないので,毎月「何をあきらめるか」を選ぶことになる.DOM に依存しない.
 */
import { LABEL, LEAGUES } from '../data/constants';
import { addChem } from '../growth/chemistry';
import { planDef, planOf } from '../growth/plans';
import { futureValue, genPlayer, growAttr, keysOf, playerValue } from '../growth/player';
import type { MenuKey } from '../growth/training';
import { MENUS } from '../growth/training';
import type { AttrKey, Career, Ingredient, MonthPlan, Player } from '../types';
import { clamp, rand, ri, shuffle } from '../util/random';
import { earn, moneyScale, spend, weeklyIncome } from './economy';
import { addTrust } from './finance';
import { findPlayer } from './team';
import { addFam } from './tactics';
import { fansBoost } from './fans';

export type ActionKey = 'scout' | 'sponsor' | 'talk' | 'special' | 'rest' | 'fan' | 'study';

export interface ActionDef {
  key: ActionKey;
  name: string;
  desc: string;
  /** 費用など,選ぶ前に知っておくこと */
  cost: (c: Career) => string;
  /** できないときは理由 */
  can: (c: Career) => string | null;
}

/** 1 か月に選べる行動の数 */
export const ACTION_SLOTS = 2;
/** 特訓に使う食材の数 */
export const SPECIAL_INGREDIENTS = 3;

const userT = (c: Career) => c.teams.find((t) => t.user)!;
const pantryTotal = (c: Career): number => Object.values(c.pantry).reduce((a, b) => a + b, 0);
const scoutFee = (c: Career): number => Math.round((moneyScale(c) * 0.03) / 10) * 10;
const sponsorFee = (c: Career): number => Math.round((moneyScale(c) * 0.07) / 10) * 10;

export const ACTIONS: ActionDef[] = [
  {
    key: 'special', name: '特訓', desc: '1 人の選手を,育成方針に沿って集中的に鍛える.食材を使う.まれに限界も広がる.',
    cost: () => `食材${SPECIAL_INGREDIENTS}つ`,
    can: (c) => (pantryTotal(c) >= SPECIAL_INGREDIENTS ? null : `食材が${SPECIAL_INGREDIENTS}つ必要です`),
  },
  {
    key: 'scout', name: 'スカウト遠征', desc: '有望な若手を探しにいく.見つかった選手はドラフトの注目選手に入る.',
    cost: (c) => `${scoutFee(c)}万円`,
    can: (c) => (c.funds >= scoutFee(c) ? null : '資金が足りません'),
  },
  {
    key: 'sponsor', name: 'スポンサー営業', desc: '地元の企業を回って協賛金を集める.選手が数人,出演で疲れる.',
    cost: (c) => `収入 +${sponsorFee(c)}万円`,
    can: () => null,
  },
  {
    key: 'talk', name: '選手と面談', desc: 'やる気の低い選手と話し,不満を和らげる.退団の心配も減る.',
    cost: () => 'なし',
    can: () => null,
  },
  {
    key: 'rest', name: '休養日', desc: 'チーム全体に休みを与え,疲れをとって調子を整える.',
    cost: () => 'なし',
    can: () => null,
  },
  {
    key: 'fan', name: 'ファン行事', desc: 'サイン会や野球教室を開く.収入と人気,オーナーの信頼が少し上がる.',
    cost: () => `収入 +${0}万円〜`,
    can: () => null,
  },
  {
    key: 'study', name: '戦術研究', desc: '試合の映像を見ながら,戦術と連携を確かめる.戦術の浸透度が大きく上がり,連携も深まる.',
    cost: () => 'なし',
    can: () => null,
  },
];
// ファン行事の収入は週の収入で決まる
ACTIONS.find((a) => a.key === 'fan')!.cost = (c) => `収入 +${weeklyIncome(c)}万円`;

export const actionDef = (k: ActionKey): ActionDef => ACTIONS.find((a) => a.key === k)!;

/** いまの月(シーズンをまたいで数える通し番号) */
export const monthIndex = (c: Career): number => c.season * 12 + Math.floor(c.cal / 4);

/** 今月の方針(決めていなければ null) */
export function currentPlan(c: Career): MonthPlan | null {
  return c.plan && c.plan.month === monthIndex(c) ? c.plan : null;
}

/** 今月の練習.決めていない,または「おまかせ」なら null. */
export const plannedMenu = (c: Career): MenuKey | null => (currentPlan(c)?.menu as MenuKey | null | undefined) ?? null;

/** 特訓のおすすめの相手: 若く,伸びしろの大きい選手 */
export function specialTarget(c: Career): Player | null {
  const ps = userT(c).players.filter((p) => !(p.inj && p.inj.weeks > 0));
  if (!ps.length) return null;
  return ps.reduce((a, b) => (futureValue(b) - playerValue(b) > futureValue(a) - playerValue(a) ? b : a));
}

/** 特訓で伸ばす能力: 育成方針の重点(なければ,その選手の伸びしろが大きい能力) */
function specialKeys(p: Player): AttrKey[] {
  const focus = planDef(planOf(p)).up.filter((k) => keysOf(p).includes(k));
  if (focus.length) return focus;
  return [...keysOf(p)].sort((a, b) => (p.pot[b] - p[b]) - (p.pot[a] - p[a])).slice(0, 2);
}

/** 食材を,多いものから順に n 個使う */
function useIngredients(c: Career, n: number): string[] {
  const used: string[] = [];
  for (let i = 0; i < n; i++) {
    const k = (Object.keys(c.pantry) as Ingredient[]).reduce((a, b) => (c.pantry[b] > c.pantry[a] ? b : a));
    if (c.pantry[k] <= 0) break;
    c.pantry[k]--;
    used.push(k);
  }
  return used;
}

/** 行動を 1 つ行う.結果の文章を返す. */
function runAction(c: Career, k: ActionKey, target: number | null): string {
  const u = userT(c);
  switch (k) {
    case 'special': {
      const p = (target !== null ? findPlayer(u, target) : null) ?? specialTarget(c);
      if (!p) return '特訓できる選手がいません.';
      useIngredients(c, SPECIAL_INGREDIENTS);
      const ks = specialKeys(p);
      const before = ks.map((x) => p[x]);
      for (const x of ks) for (let i = 0; i < 4; i++) growAttr(p, x, 1.2);
      p.fatigue = clamp(p.fatigue + 22, 0, 100);
      p.morale = clamp(p.morale + 6, 0, 100);
      let wake = '';
      if (rand() < 0.12) {
        const x = ks[0];
        p.pot[x] = clamp(p.pot[x] + ri(4, 8), Math.ceil(p[x]), 99);
        wake = ' 限界も広がりました!';
      }
      const ups = ks.map((x, i) => `${LABEL[x]}+${Math.max(0, Math.round(p[x] - before[i]))}`);
      return `${p.name}の特訓: ${ups.join(' ')}.${wake}`;
    }
    case 'scout': {
      spend(c, 'scout', scoutFee(c));
      const role = rand() < 0.5 ? '野手' : '投手';
      const q = genPlayer(c, role, LEAGUES[c.level].base - 4, { age: ri(18, 22), potMul: 1.15 });
      q.watched = true;
      c.watch.push(q);
      if (c.watch.length > 6) c.watch.shift();
      return `スカウト遠征で${q.name}(${q.age}歳,${role})を見つけ,ドラフトの注目選手に入れました.`;
    }
    case 'sponsor': {
      earn(c, 'event', sponsorFee(c));
      for (const x of shuffle(u.players).slice(0, 3)) x.fatigue = clamp(x.fatigue + 10, 0, 100);
      return `協賛金 ${sponsorFee(c)}万円を集めました.`;
    }
    case 'talk': {
      const low = u.players.filter((p) => p.morale < 60).sort((a, b) => a.morale - b.morale).slice(0, 4);
      for (const p of low) p.morale = clamp(p.morale + 15, 0, 100);
      return low.length ? `${low.map((p) => p.name).join(',')}と面談し,やる気が上がりました.` : '面談しましたが,みんな前向きでした.';
    }
    case 'rest': {
      for (const p of u.players) { p.fatigue = Math.max(0, p.fatigue - 30); p.cond = clamp(p.cond + 1, 0, 4); }
      return 'チーム全体が休養し,疲れがとれました.';
    }
    case 'fan': {
      earn(c, 'event', weeklyIncome(c));
      c.revenue = Math.min(1.3, c.revenue + 0.01);
      fansBoost(c, 'event');
      addTrust(c, 1);
      return 'ファン行事は大盛況でした.収入と人気が上がりました.';
    }
    case 'study': {
      const ids = u.lineup.map((e) => e.pid);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) addChem(u, ids[i], ids[j], 3);
      for (let i = 0; i < u.pitchers.length; i++) for (const id of ids.slice(0, 1)) addChem(u, u.pitchers[i], id, 3);
      addFam(c, 25);
      return `戦術研究で,戦術の浸透度が${Math.round(c.tacticFam ?? 100)}になり,連携も深まりました.`;
    }
  }
}

/**
 * 今月の方針を決めて,行動を行う.できないときは理由を返す(何も変えない).
 * @param menu 練習(null ならおまかせ)
 * @param target 特訓の相手(null ならおすすめの選手)
 */
export function setMonthPlan(c: Career, menu: MenuKey | null, actions: ActionKey[], target: number | null = null): { error: string | null; results: string[] } {
  if (currentPlan(c)) return { error: '今月の方針は,もう決めています.', results: [] };
  if (menu !== null && !(menu in MENUS)) return { error: '練習が正しくありません.', results: [] };
  if (actions.length > ACTION_SLOTS) return { error: `行動は${ACTION_SLOTS}つまでです.`, results: [] };
  if (new Set(actions).size !== actions.length) return { error: '同じ行動は 1 か月に 1 回です.', results: [] };
  for (const k of actions) {
    const why = actionDef(k).can(c);
    if (why) return { error: `${actionDef(k).name}: ${why}`, results: [] };
  }
  const results = actions.map((k) => runAction(c, k, target));
  c.plan = { month: monthIndex(c), menu, actions, target, results };
  return { error: null, results };
}

/** 決めずに進んだ月は,練習だけおまかせにして,行動はしない */
export function ensurePlan(c: Career): void {
  if (!currentPlan(c)) c.plan = { month: monthIndex(c), menu: null, actions: [], target: null, results: [] };
}

/** 月のはじめで,まだ方針を決めていないか */
export const needsPlan = (c: Career): boolean => c.phase === 'season' && !currentPlan(c);

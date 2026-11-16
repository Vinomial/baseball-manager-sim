/**
 * 食材と料理.料理は「体を整える」もの: 疲れ,怪我,調子,やる気に効く.能力を上げるのは特訓や練習の役目.
 * 料理の効き目は,使う食材で決まる(米は疲れがとれやすく,肉は怪我をしにくく,魚は調子が上がりやすい.
 * 野菜と果物はすぐ疲れをとり,卵はやる気を上げる).
 */
import type { Career, Ingredient, Meal } from '../types';
import { clamp } from '../util/random';

export const INGREDIENTS: { key: Ingredient; name: string; flavor: string }[] = [
  { key: 'rice', name: '米', flavor: 'しばらく疲れがとれやすい' },
  { key: 'meat', name: '肉', flavor: 'しばらく怪我をしにくい' },
  { key: 'fish', name: '魚', flavor: 'しばらく調子が上がりやすい' },
  { key: 'veg', name: '野菜', flavor: 'すぐ疲れがとれる' },
  { key: 'fruit', name: '果物', flavor: 'すぐ疲れがとれ,調子が上がる' },
  { key: 'egg', name: '卵', flavor: 'すぐやる気が上がる' },
];
export const ingName = (k: Ingredient): string => INGREDIENTS.find((x) => x.key === k)!.name;
export const emptyPantry = (): Record<Ingredient, number> => ({ rice: 0, meat: 0, fish: 0, veg: 0, fruit: 0, egg: 0 });

export interface Recipe {
  key: string;
  name: string;
  need: Partial<Record<Ingredient, number>>;
  /** しばらく続く効き目(米・肉・魚)の週数 */
  weeks: number;
  /** 料理の種類 */
  kind: RecipeKind;
}

export type RecipeKind = '主食' | '主菜' | '汁物' | '甘味' | '勝負めし' | '特別';
export const RECIPE_KINDS: RecipeKind[] = ['主食', '主菜', '汁物', '甘味', '勝負めし', '特別'];

/** 季節の食材(旬).旬の食材を使うと,効き目が1割5分大きい. */
export function seasonalIng(cal: number): Ingredient {
  const month = Math.floor((cal % 48) / 4) + 1;
  return month >= 3 && month <= 5 ? 'veg' : month >= 6 && month <= 8 ? 'fruit' : month >= 9 && month <= 11 ? 'rice' : 'fish';
}
export const SEASON_NAME = (cal: number): string => {
  const month = Math.floor((cal % 48) / 4) + 1;
  return month >= 3 && month <= 5 ? '春' : month >= 6 && month <= 8 ? '夏' : month >= 9 && month <= 11 ? '秋' : '冬';
};

export const RECIPES: Recipe[] = [
  { key: 'onigiri', kind: '主食', name: 'おにぎり', need: { rice: 1 }, weeks: 2 },
  { key: 'katsu', kind: '勝負めし', name: 'カツ丼', need: { rice: 1, meat: 1, egg: 1 }, weeks: 4 },
  { key: 'steak', kind: '主菜', name: 'ステーキ', need: { meat: 2 }, weeks: 2 },
  { key: 'fish', kind: '主菜', name: '焼き魚定食', need: { rice: 1, fish: 1, veg: 1 }, weeks: 4 },
  { key: 'curry', kind: '主食', name: '野菜カレー', need: { rice: 1, veg: 2 }, weeks: 4 },
  { key: 'sushi', kind: '特別', name: '寿司盛り合わせ', need: { rice: 1, fish: 2 }, weeks: 4 },
  { key: 'parfait', kind: '甘味', name: 'フルーツパフェ', need: { fruit: 2, egg: 1 }, weeks: 2 },
  { key: 'hamburg', kind: '主菜', name: 'ハンバーグ定食', need: { rice: 1, meat: 1, veg: 1, egg: 1 }, weeks: 4 },
  { key: 'kaisen', kind: '主食', name: '海鮮丼', need: { rice: 1, fish: 2, egg: 1 }, weeks: 4 },
  { key: 'stamina', kind: '主食', name: 'スタミナ丼', need: { rice: 1, meat: 1, veg: 1 }, weeks: 4 },
  { key: 'soup', kind: '汁物', name: '野菜スープ', need: { veg: 2 }, weeks: 2 },
  { key: 'juice', kind: '甘味', name: 'フルーツジュース', need: { fruit: 1 }, weeks: 1 },
  { key: 'nabe', kind: '汁物', name: '栄養満点鍋', need: { meat: 1, fish: 1, veg: 2, egg: 1 }, weeks: 4 },
  { key: 'fullcourse', kind: '特別', name: '特製フルコース', need: { rice: 1, meat: 1, fish: 1, veg: 1, fruit: 1, egg: 1 }, weeks: 8 },
  { key: 'bento', kind: '特別', name: '豪華弁当', need: { rice: 2, meat: 1, fish: 1, veg: 1, egg: 1 }, weeks: 6 },
  { key: 'oyako', kind: '主食', name: '親子丼', need: { rice: 1, meat: 1, egg: 1 }, weeks: 3 },
  { key: 'karaage', kind: '主菜', name: '唐揚げ定食', need: { rice: 1, meat: 1, veg: 1 }, weeks: 3 },
  { key: 'yakiniku', kind: '主菜', name: '焼肉定食', need: { rice: 1, meat: 2, veg: 1 }, weeks: 4 },
  { key: 'tonjiru', kind: '汁物', name: '豚汁', need: { meat: 1, veg: 1 }, weeks: 2 },
  { key: 'tkg', kind: '主食', name: '卵かけごはん', need: { rice: 1, egg: 1 }, weeks: 2 },
  { key: 'sake', kind: '主食', name: '鮭おにぎり', need: { rice: 1, fish: 1 }, weeks: 2 },
  { key: 'salad', kind: '甘味', name: 'フルーツサラダ', need: { fruit: 1, veg: 1 }, weeks: 2 },
  { key: 'sashimi', kind: '主菜', name: '刺身定食', need: { rice: 1, fish: 2, veg: 1 }, weeks: 4 },
  { key: 'okonomi', kind: '主食', name: 'お好み焼き', need: { egg: 1, veg: 1, meat: 1 }, weeks: 3 },
  { key: 'chanko', kind: '汁物', name: 'ちゃんこ鍋', need: { meat: 2, fish: 1, veg: 2, egg: 1 }, weeks: 6 },
  { key: 'smoothie', kind: '甘味', name: 'スムージー', need: { fruit: 1, egg: 1 }, weeks: 1 },
  { key: 'victory', kind: '勝負めし', name: '勝負めしステーキ', need: { meat: 2, rice: 1, egg: 1 }, weeks: 3 },
  { key: 'tonkatsu', kind: '勝負めし', name: '特製カツカレー', need: { rice: 1, meat: 1, veg: 1, egg: 1 }, weeks: 4 },
  { key: 'feast', kind: '特別', name: '祝勝会のごちそう', need: { rice: 2, meat: 2, fish: 2, veg: 1, fruit: 1, egg: 1 }, weeks: 8 },
];

export function canCook(c: Career, r: Recipe): boolean {
  return (Object.entries(r.need) as [Ingredient, number][]).every(([k, n]) => c.pantry[k] >= n);
}

/** 料理の効き目.weeks のあいだ続くもの(rest,guard,lift)と,食べてすぐのもの(recover,cond,morale). */
export interface MealEffect {
  weeks: number;
  /** 毎週,疲れが余分にとれる量 */
  rest: number;
  /** 怪我の起きやすさの倍率(1 より小さいほど起きにくい) */
  guard: number;
  /** 毎週の調子の上がりやすさ */
  lift: number;
  /** 食べてすぐ減る疲れ */
  recover: number;
  /** 食べてすぐ上がる調子の段階 */
  cond: number;
  /** 食べてすぐ上がるやる気 */
  morale: number;
}

/** 食堂の強さと旬による効き目の倍率 */
const boost = (c: Career, r: Recipe): number => (1 + c.fac.canteen * 0.1) * (r.need[seasonalIng(c.cal)] ? 1.15 : 1);

/** いま作ったときの効き目(食堂と旬を含む) */
export function mealEffect(c: Career, r: Recipe): MealEffect {
  const n = (k: Ingredient): number => r.need[k] ?? 0;
  const f = boost(c, r);
  const lasting = n('rice') + n('meat') + n('fish') > 0;
  return {
    weeks: lasting ? r.weeks + (c.fac.canteen >= 3 ? 1 : 0) : 0,
    rest: Math.round(n('rice') * 4 * f),
    guard: n('meat') ? clamp(1 - n('meat') * 0.18 * f, 0.4, 1) : 1,
    lift: clamp(n('fish') * 0.4 * f, 0, 1),
    recover: Math.round((n('veg') * 15 + n('fruit') * 20) * f),
    cond: (n('fruit') ? 1 : 0) + (r.kind === '勝負めし' ? 2 : 0),
    morale: Math.round(n('egg') * 5 * f),
  };
}

/** 効き目の説明(数字で) */
export function effectText(e: MealEffect): string {
  const last: string[] = [], now: string[] = [];
  if (e.rest) last.push(`疲れが毎週${e.rest}多くとれる`);
  if (e.guard < 1) last.push(`怪我が${Math.round((1 - e.guard) * 100)}%起きにくい`);
  if (e.lift) last.push('調子が上がりやすい');
  if (e.recover) now.push(`疲れ-${e.recover}`);
  if (e.cond) now.push(`調子+${e.cond}`);
  if (e.morale) now.push(`やる気+${e.morale}`);
  return [last.length ? `${e.weeks}週間: ${last.join(',')}` : '', now.length ? `食べてすぐ全員: ${now.join(',')}` : ''].filter(Boolean).join(' / ');
}

/**
 * 料理を作って食べる.できないときは null.free なら食材を使わない(差し入れなど).
 * しばらく続く効き目のある料理は,いま効いている料理と入れ替わる.すぐ効くだけの料理は,いまの料理を消さない.
 */
export function cook(c: Career, key: string, free = false): { name: string; desc: string } | null {
  const r = RECIPES.find((x) => x.key === key);
  if (!r || (!free && !canCook(c, r))) return null;
  if (!free) for (const [k, n] of Object.entries(r.need) as [Ingredient, number][]) c.pantry[k] -= n;
  const e = mealEffect(c, r);
  const name = r.need[seasonalIng(c.cal)] ? `${r.name}(旬)` : r.name;
  const desc = effectText(e);
  if (e.weeks > 0) c.meal = { name, weeks: e.weeks, desc, rest: e.rest, guard: e.guard, lift: e.lift };
  const u = c.teams.find((t) => t.user)!;
  for (const p of u.players) {
    p.fatigue = Math.max(0, p.fatigue - e.recover);
    p.cond = Math.min(4, p.cond + e.cond);
    p.morale = clamp(p.morale + e.morale, 0, 100);
  }
  return { name, desc };
}

/** いま効いている料理(なければ null) */
const active = (meal: Meal | null): Meal | null => (meal && meal.weeks > 0 ? meal : null);
/** 毎週,疲れが余分にとれる量 */
export const mealRest = (meal: Meal | null): number => active(meal)?.rest ?? 0;
/** 怪我の起きやすさの倍率 */
export const mealGuard = (meal: Meal | null): number => active(meal)?.guard ?? 1;
/** 毎週の調子の上がりやすさ */
export const mealLift = (meal: Meal | null): number => active(meal)?.lift ?? 0;

/** 1 週ぶん効き目を減らす */
export function tickMeal(c: Career): void {
  if (!c.meal) return;
  c.meal.weeks--;
  if (c.meal.weeks <= 0) c.meal = null;
}

export const recipeNeedText = (r: Recipe): string =>
  (Object.entries(r.need) as [Ingredient, number][]).map(([k, n]) => `${ingName(k)}×${n}`).join(' ');

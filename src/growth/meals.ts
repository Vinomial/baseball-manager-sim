/** 食材と料理.料理を食べると,しばらく練習の伸びが大きくなる. */
import type { AttrKey, Career, Ingredient, Meal } from '../types';

export const INGREDIENTS: { key: Ingredient; name: string; flavor: string }[] = [
  { key: 'rice', name: '米', flavor: '体力のもと' },
  { key: 'meat', name: '肉', flavor: 'パワーのもと' },
  { key: 'fish', name: '魚', flavor: '集中力のもと' },
  { key: 'veg', name: '野菜', flavor: 'スタミナのもと' },
  { key: 'fruit', name: '果物', flavor: '回復のもと' },
  { key: 'egg', name: '卵', flavor: '調子のもと' },
];
export const ingName = (k: Ingredient): string => INGREDIENTS.find((x) => x.key === k)!.name;
export const emptyPantry = (): Record<Ingredient, number> => ({ rice: 0, meat: 0, fish: 0, veg: 0, fruit: 0, egg: 0 });

export interface Recipe {
  key: string;
  name: string;
  need: Partial<Record<Ingredient, number>>;
  weeks: number;
  mult: Meal['mult'];
  desc: string;
  /** 食べたときに調子と疲れを整える */
  recover?: boolean;
}

export const RECIPES: Recipe[] = [
  { key: 'onigiri', name: 'おにぎり', need: { rice: 1 }, weeks: 2, mult: { all: 1.2 }, desc: '2週間,全能力の伸びが2割増える' },
  { key: 'katsu', name: 'カツ丼', need: { rice: 1, meat: 1, egg: 1 }, weeks: 4, mult: { meet: 1.7, power: 1.7, all: 1.1 }, desc: '4週間,ミートとパワーの伸びが大きい' },
  { key: 'steak', name: 'ステーキ', need: { meat: 2 }, weeks: 2, mult: { power: 2.2, velo: 2.2, all: 1.0 }, desc: '2週間,パワーと球威が大きく伸びる' },
  { key: 'fish', name: '焼き魚定食', need: { rice: 1, fish: 1, veg: 1 }, weeks: 4, mult: { ctrl: 1.8, meet: 1.5, all: 1.1 }, desc: '4週間,制球とミートの伸びが大きい' },
  { key: 'curry', name: '野菜カレー', need: { rice: 1, veg: 2 }, weeks: 4, mult: { stam: 2, speed: 1.8, field: 1.3, all: 1.1 }, desc: '4週間,スタミナと走力の伸びが大きい' },
  { key: 'sushi', name: '寿司盛り合わせ', need: { rice: 1, fish: 2 }, weeks: 4, mult: { all: 1.5 }, desc: '4週間,全能力の伸びが5割増える' },
  { key: 'parfait', name: 'フルーツパフェ', need: { fruit: 2, egg: 1 }, weeks: 2, mult: { all: 1.3 }, desc: '2週間,全能力が伸び,疲れと調子も整う', recover: true },
  { key: 'bento', name: '豪華弁当', need: { rice: 2, meat: 1, fish: 1, veg: 1, egg: 1 }, weeks: 6, mult: { all: 1.7 }, desc: '6週間,全能力の伸びが7割増える(特別な一品)' },
];

export function canCook(c: Career, r: Recipe): boolean {
  return (Object.entries(r.need) as [Ingredient, number][]).every(([k, n]) => c.pantry[k] >= n);
}

/** 料理を作って食べる.できないときは null. */
export function cook(c: Career, key: string): Meal | null {
  const r = RECIPES.find((x) => x.key === key);
  if (!r || !canCook(c, r)) return null;
  for (const [k, n] of Object.entries(r.need) as [Ingredient, number][]) c.pantry[k] -= n;
  // 食堂が整っているほど,効き目が強く長い
  const f = 1 + c.fac.canteen * 0.1;
  const mult: Meal['mult'] = {};
  for (const [k, v] of Object.entries(r.mult) as [keyof Meal['mult'], number][]) mult[k] = 1 + (v - 1) * f;
  c.meal = { name: r.name, weeks: r.weeks + (c.fac.canteen >= 3 ? 1 : 0), mult, desc: r.desc };
  if (r.recover) {
    const u = c.teams.find((t) => t.user)!;
    for (const p of u.players) { p.fatigue = Math.max(0, p.fatigue - 40); p.cond = Math.min(4, p.cond + 1); }
  }
  return c.meal;
}

/** 食べた料理による,能力ごとの伸びの倍率 */
export function mealMult(meal: Meal | null, k: AttrKey): number {
  if (!meal || meal.weeks <= 0) return 1;
  return meal.mult[k] ?? meal.mult.all ?? 1;
}

/** 1試合ぶん効き目を減らす */
export function tickMeal(c: Career): void {
  if (!c.meal) return;
  c.meal.weeks--;
  if (c.meal.weeks <= 0) c.meal = null;
}

export const recipeNeedText = (r: Recipe): string =>
  (Object.entries(r.need) as [Ingredient, number][]).map(([k, n]) => `${ingName(k)}×${n}`).join(' ');

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
  /** 食べたときに,全員の疲れをとり調子を整える量(疲れが減る数) */
  recover?: number;
  /** 食べたときに,全員の調子が上がる段階 */
  cond?: number;
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
  { key: 'onigiri', kind: '主食', name: 'おにぎり', need: { rice: 1 }, weeks: 2, mult: { all: 1.2 }, desc: '2週間,全能力の伸びが2割増える' },
  { key: 'katsu', kind: '勝負めし', name: 'カツ丼', need: { rice: 1, meat: 1, egg: 1 }, weeks: 4, mult: { meet: 1.7, power: 1.7, all: 1.1 }, desc: '4週間,ミートとパワーの伸びが大きい' },
  { key: 'steak', kind: '主菜', name: 'ステーキ', need: { meat: 2 }, weeks: 2, mult: { power: 2.2, velo: 2.2, all: 1.0 }, desc: '2週間,パワーと球威が大きく伸びる' },
  { key: 'fish', kind: '主菜', name: '焼き魚定食', need: { rice: 1, fish: 1, veg: 1 }, weeks: 4, mult: { ctrl: 1.8, meet: 1.5, all: 1.1 }, desc: '4週間,制球とミートの伸びが大きい' },
  { key: 'curry', kind: '主食', name: '野菜カレー', need: { rice: 1, veg: 2 }, weeks: 4, mult: { stam: 2, speed: 1.8, field: 1.3, all: 1.1 }, desc: '4週間,スタミナと走力の伸びが大きい' },
  { key: 'sushi', kind: '特別', name: '寿司盛り合わせ', need: { rice: 1, fish: 2 }, weeks: 4, mult: { all: 1.5 }, desc: '4週間,全能力の伸びが5割増える' },
  { key: 'parfait', kind: '甘味', name: 'フルーツパフェ', need: { fruit: 2, egg: 1 }, weeks: 2, mult: { all: 1.3 }, desc: '2週間,全能力が伸び,疲れと調子も整う', recover: 40 },
  { key: 'hamburg', kind: '主菜', name: 'ハンバーグ定食', need: { rice: 1, meat: 1, veg: 1, egg: 1 }, weeks: 4, mult: { power: 1.7, field: 1.6, all: 1.15 }, desc: '4週間,パワーと守備の伸びが大きい' },
  { key: 'kaisen', kind: '主食', name: '海鮮丼', need: { rice: 1, fish: 2, egg: 1 }, weeks: 4, mult: { ctrl: 1.9, meet: 1.7, all: 1.1 }, desc: '4週間,制球とミートの伸びが大きい' },
  { key: 'stamina', kind: '主食', name: 'スタミナ丼', need: { rice: 1, meat: 1, veg: 1 }, weeks: 4, mult: { stam: 2.2, power: 1.4, speed: 1.4, all: 1.1 }, desc: '4週間,スタミナの伸びがとても大きい' },
  { key: 'soup', kind: '汁物', name: '野菜スープ', need: { veg: 2 }, weeks: 2, mult: { stam: 1.5, all: 1.1 }, desc: '2週間,やさしい味.疲れをとる', recover: 30 },
  { key: 'juice', kind: '甘味', name: 'フルーツジュース', need: { fruit: 1 }, weeks: 1, mult: { all: 1.1 }, desc: '1週間,さっと疲れをとる', recover: 25 },
  { key: 'nabe', kind: '汁物', name: '栄養満点鍋', need: { meat: 1, fish: 1, veg: 2, egg: 1 }, weeks: 4, mult: { all: 1.6 }, desc: '4週間,全能力が伸び,疲れもとれる', recover: 30 },
  { key: 'fullcourse', kind: '特別', name: '特製フルコース', need: { rice: 1, meat: 1, fish: 1, veg: 1, fruit: 1, egg: 1 }, weeks: 8, mult: { all: 2.0 }, desc: '8週間,全能力の伸びが2倍(最高の一品)', recover: 50 },
  { key: 'bento', kind: '特別', name: '豪華弁当', need: { rice: 2, meat: 1, fish: 1, veg: 1, egg: 1 }, weeks: 6, mult: { all: 1.7 }, desc: '6週間,全能力の伸びが7割増える(特別な一品)' },
  { key: 'oyako', kind: '主食', name: '親子丼', need: { rice: 1, meat: 1, egg: 1 }, weeks: 3, mult: { meet: 1.5, field: 1.5, all: 1.1 }, desc: '3週間,ミートと守備の伸びが大きく,調子も上がる', cond: 1 },
  { key: 'karaage', kind: '主菜', name: '唐揚げ定食', need: { rice: 1, meat: 1, veg: 1 }, weeks: 3, mult: { power: 1.6, stam: 1.5, all: 1.1 }, desc: '3週間,パワーとスタミナの伸びが大きい' },
  { key: 'yakiniku', kind: '主菜', name: '焼肉定食', need: { rice: 1, meat: 2, veg: 1 }, weeks: 4, mult: { power: 2.0, velo: 2.0, speed: 1.3, all: 1.1 }, desc: '4週間,パワーと球威の伸びがとても大きい' },
  { key: 'tonjiru', kind: '汁物', name: '豚汁', need: { meat: 1, veg: 1 }, weeks: 2, mult: { stam: 1.5, all: 1.15 }, desc: '2週間,体があたたまり,疲れもとれる', recover: 25 },
  { key: 'tkg', kind: '主食', name: '卵かけごはん', need: { rice: 1, egg: 1 }, weeks: 2, mult: { all: 1.25 }, desc: '2週間,全能力が伸び,調子が上がる', cond: 1 },
  { key: 'sake', kind: '主食', name: '鮭おにぎり', need: { rice: 1, fish: 1 }, weeks: 2, mult: { ctrl: 1.5, all: 1.2 }, desc: '2週間,制球と全能力の伸びが大きい' },
  { key: 'salad', kind: '甘味', name: 'フルーツサラダ', need: { fruit: 1, veg: 1 }, weeks: 2, mult: { all: 1.2 }, desc: '2週間,全能力が伸び,疲れもとれる', recover: 30 },
  { key: 'sashimi', kind: '主菜', name: '刺身定食', need: { rice: 1, fish: 2, veg: 1 }, weeks: 4, mult: { ctrl: 2.0, velo: 1.5, field: 1.4, all: 1.1 }, desc: '4週間,制球と球威の伸びが大きい' },
  { key: 'okonomi', kind: '主食', name: 'お好み焼き', need: { egg: 1, veg: 1, meat: 1 }, weeks: 3, mult: { all: 1.35 }, desc: '3週間,全能力の伸びが3割5分増える' },
  { key: 'chanko', kind: '汁物', name: 'ちゃんこ鍋', need: { meat: 2, fish: 1, veg: 2, egg: 1 }, weeks: 6, mult: { stam: 2.0, power: 1.6, all: 1.4 }, desc: '6週間,スタミナとパワーが大きく伸び,疲れもとれる', recover: 35 },
  { key: 'smoothie', kind: '甘味', name: 'スムージー', need: { fruit: 1, egg: 1 }, weeks: 1, mult: { all: 1.15 }, desc: '1週間,調子が上がり,疲れもとれる', recover: 20, cond: 1 },
  { key: 'victory', kind: '勝負めし', name: '勝負めしステーキ', need: { meat: 2, rice: 1, egg: 1 }, weeks: 3, mult: { power: 2.4, velo: 2.4, meet: 1.4, all: 1.1 }, desc: '3週間,パワーと球威が大きく伸び,全員の調子が上がる', cond: 2 },
  { key: 'tonkatsu', kind: '勝負めし', name: '特製カツカレー', need: { rice: 1, meat: 1, veg: 1, egg: 1 }, weeks: 4, mult: { meet: 1.8, stam: 1.6, speed: 1.4, all: 1.15 }, desc: '4週間,ミートとスタミナが大きく伸び,調子も上がる', cond: 1 },
  { key: 'feast', kind: '特別', name: '祝勝会のごちそう', need: { rice: 2, meat: 2, fish: 2, veg: 1, fruit: 1, egg: 1 }, weeks: 8, mult: { all: 2.3 }, desc: '8週間,全能力の伸びが2.3倍.疲れも調子も整う(最大の一品)', recover: 60, cond: 2 },
];

export function canCook(c: Career, r: Recipe): boolean {
  return (Object.entries(r.need) as [Ingredient, number][]).every(([k, n]) => c.pantry[k] >= n);
}

/** 料理を作って食べる.できないときは null.free なら食材を使わない(差し入れなど). */
export function cook(c: Career, key: string, free = false): Meal | null {
  const r = RECIPES.find((x) => x.key === key);
  if (!r || (!free && !canCook(c, r))) return null;
  if (!free) for (const [k, n] of Object.entries(r.need) as [Ingredient, number][]) c.pantry[k] -= n;
  // 食堂が整っているほど,効き目が強く長い
  const sea = r.need[seasonalIng(c.cal)] ? 1.15 : 1;
  const f = (1 + c.fac.canteen * 0.1) * sea;
  const mult: Meal['mult'] = {};
  for (const [k, v] of Object.entries(r.mult) as [keyof Meal['mult'], number][]) mult[k] = 1 + (v - 1) * f;
  c.meal = { name: sea > 1 ? `${r.name}(旬)` : r.name, weeks: r.weeks + (c.fac.canteen >= 3 ? 1 : 0), mult, desc: r.desc };
  const u = c.teams.find((t) => t.user)!;
  if (r.recover) for (const p of u.players) { p.fatigue = Math.max(0, p.fatigue - r.recover); p.cond = Math.min(4, p.cond + 1); }
  if (r.cond) for (const p of u.players) p.cond = Math.min(4, p.cond + r.cond);
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

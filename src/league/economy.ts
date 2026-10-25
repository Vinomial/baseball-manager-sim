/** 資金,施設,食材の売却.DOM に依存しない. */
import { ingName } from '../growth/meals';
import type { Career, FacKey, Ingredient, LedgerRow } from '../types';
import { clamp, rand } from '../util/random';
import { budgetFor } from './finance';

export const MAX_FAC = 5;

export interface FacDef { key: FacKey; name: string; desc: (lv: number) => string; }

export const FACILITIES: FacDef[] = [
  { key: 'stadium', name: 'スタジアム', desc: (lv) => `入場収入 +${lv * 15}%` },
  { key: 'ground', name: '練習場', desc: (lv) => `練習の伸び +${lv * 6}%` },
  { key: 'clinic', name: '医務室', desc: (lv) => `怪我が ${lv * 10}% 起きにくく,${lv >= 3 ? '治りも早い' : '治りの早さは3以上で向上'}` },
  { key: 'canteen', name: '食堂', desc: (lv) => `料理の効き目 +${lv * 10}%${lv >= 3 ? ',効く期間も長い' : ''}` },
  { key: 'scout', name: 'スカウト室', desc: (lv) => `ドラフト候補の能力の見積もりが ${lv * 15}% 正確` },
];

/** 収支の科目名 */
export const INCOME_KINDS: Record<string, string> = { week: '毎週の収入', gate: '入場収入', sell: '食材の売却', trade: '選手の売却', event: '出来事・協賛', goal: '目標の報酬' };
export const EXPENSE_KINDS: Record<string, string> = { staff: 'スタッフの給料', hire: '契約金・退職金', facility: '施設の強化', scout: 'スカウト' };

/** 今年の収支の行 */
export function ledgerRow(c: Career): LedgerRow {
  let r = c.ledger[c.ledger.length - 1];
  if (!r || r.season !== c.season) {
    r = { season: c.season, income: {}, expense: {} };
    c.ledger.push(r);
    if (c.ledger.length > 12) c.ledger.shift();
  }
  return r;
}

/** 収入.資金を増やし,収支に記録する */
export function earn(c: Career, kind: string, amount: number): void {
  if (amount <= 0) return;
  c.funds += amount;
  const r = ledgerRow(c);
  r.income[kind] = (r.income[kind] ?? 0) + amount;
}

/** 支出.資金を減らし,収支に記録する(足りない分は 0 にとどめる) */
export function spend(c: Career, kind: string, amount: number): void {
  if (amount <= 0) return;
  c.funds = Math.max(0, c.funds - amount);
  const r = ledgerRow(c);
  r.expense[kind] = (r.expense[kind] ?? 0) + amount;
}

export const emptyFac = (): Record<FacKey, number> => ({ stadium: 0, ground: 0, clinic: 0, canteen: 0, scout: 0 });
export const emptyMarket = (): Record<Ingredient, number> => ({ rice: 1, meat: 1, fish: 1, veg: 1, fruit: 1, egg: 1 });

/** お金の目安.リーグが上がるほど大きくなる(年俸の予算に比例). */
export const moneyScale = (c: Career): number => Math.max(500, budgetFor(c));

/** 1 週の収入(万円) */
export function weeklyIncome(c: Career): number {
  const win = c.rec.total.w + c.rec.total.l ? c.rec.total.w / (c.rec.total.w + c.rec.total.l) : 0.5;
  return Math.round(moneyScale(c) * 0.011 * (1 + c.fac.stadium * 0.15) * (0.85 + 0.3 * win));
}

/** 試合の入場収入(ホームゲームのみ).プレーオフと選手権は 2 倍. */
export function gateIncome(c: Career, big: boolean): number {
  return Math.round(moneyScale(c) * 0.006 * (1 + c.fac.stadium * 0.15) * (big ? 2 : 1));
}

export const upgradeCost = (c: Career, key: FacKey): number =>
  Math.round((moneyScale(c) * [0.5, 0.9, 1.5, 2.3, 3.4][Math.min(4, c.fac[key])]) / 10) * 10;

/** 施設を強くする.できないときは理由を返す. */
export function upgrade(c: Career, key: FacKey): string | null {
  if (c.fac[key] >= MAX_FAC) return 'これ以上は強化できません.';
  const cost = upgradeCost(c, key);
  if (c.funds < cost) return '資金が足りません.';
  spend(c, 'facility', cost);
  c.fac[key]++;
  return null;
}

/** 食材 1 個の売値(万円) */
export const ingredientPrice = (c: Career, k: Ingredient): number => Math.max(1, Math.round(moneyScale(c) * 0.0028 * c.market[k]));

export function sellIngredient(c: Career, k: Ingredient, n: number): string | null {
  const have = Math.min(n, c.pantry[k]);
  if (have <= 0) return `${ingName(k)}がありません.`;
  c.pantry[k] -= have;
  earn(c, 'sell', have * ingredientPrice(c, k));
  return null;
}

/** 毎週,食材の相場が少し動く */
export function stepMarket(c: Career): void {
  for (const k of Object.keys(c.market) as Ingredient[]) {
    c.market[k] = clamp(c.market[k] * (0.9 + rand() * 0.2) + (1 - c.market[k]) * 0.1, 0.6, 1.6);
  }
}

/** 練習の伸びの倍率(練習場) */
export const trainFacMult = (c: Career): number => 1 + c.fac.ground * 0.06;

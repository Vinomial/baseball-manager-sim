/** 練習メニューの見込みとおすすめ.DOM に依存しない. */
import { ALL_KEYS, LABEL } from '../data/constants';
import type { AttrKey, Career, Meal, Team } from '../types';
import { mealMult } from './meals';
import { leagueTeams } from '../league/schedule';
import { teamAttrs } from '../league/team';
import { ageFactor, keysOf } from './player';
import { BASE_GAIN, MENUS, type MenuKey } from './training';

export type Gains = Record<AttrKey, number>;

const zero = (): Gains => ({ meet: 0, power: 0, speed: 0, field: 0, velo: 0, ctrl: 0, stam: 0 });

/** growAttr の平均的な 1 回分.乱数の平均 (0.7 + 0.5 * 1.6 = 1.5) を使う. */
const MEAN = 1.5;

/**
 * weeks 週同じ練習を続けたときの,能力ごとの平均的な伸び(チーム全体の平均).
 * 伸びは上限に近づくほど鈍るので,1 週ずつ積み上げて計算する.
 */
export function projectGains(t: Team, menu: MenuKey, weeks: number, scale: number, meal: Meal | null = null): Gains {
  const m = MENUS[menu];
  const sum = zero(), n = zero();
  for (const p of t.players) {
    const af = ageFactor(p);
    for (const k of keysOf(p)) {
      const mult = (m.focus[k] ?? m.base ?? BASE_GAIN) * scale;
      let v = p[k];
      for (let w = 0; w < weeks; w++) {
        const mm = meal && w < meal.weeks ? mealMult(meal, k) : 1;
        const room = p.pot[k] - v;
        const rf = room <= 0 ? 0.04 : Math.min(1, 0.25 + room / 14);
        v = Math.min(99, v + MEAN * mult * mm * af * rf);
      }
      sum[k] += v - p[k];
      n[k]++;
    }
  }
  for (const k of ALL_KEYS) sum[k] = n[k] ? sum[k] / n[k] : 0;
  return sum;
}

export interface MenuAdvice {
  menu: MenuKey;
  gains: Gains;
  /** 能力ごとの伸びの合計(表示用) */
  total: number;
  /** おすすめ度.弱点を伸ばせるほど高い. */
  score: number;
}

export interface Advice {
  best: MenuKey;
  reason: string;
  menus: Record<MenuKey, MenuAdvice>;
  /** 自チームとリーグ平均の差(正なら上) */
  gap: Gains;
}

/** 疲れや不調で休ませたいかどうか */
function needsRest(t: Team): { rest: boolean; why: string } {
  const ps = t.pitchers.slice(0, 5).map((id) => t.players.find((p) => p.id === id)).filter((p) => !!p);
  const fat = ps.length ? ps.reduce((s, p) => s + p!.fatigue, 0) / ps.length : 0;
  const cond = t.players.reduce((s, p) => s + p.cond, 0) / t.players.length;
  if (fat >= 55) return { rest: true, why: '先発投手の疲れがたまっています' };
  if (cond <= 1.3) return { rest: true, why: 'チーム全体の調子が落ちています' };
  return { rest: false, why: '' };
}

/**
 * 今のチームに合う練習を選ぶ.
 * @param lgAvg リーグ平均の能力
 * @param weeks 残りの試合数
 */
export function adviseTraining(t: Team, lgAvg: Gains, weeks: number, scale: number, meal: Meal | null = null): Advice {
  const mine = teamAttrs(t);
  const gap = zero();
  for (const k of ALL_KEYS) gap[k] = mine[k] - lgAvg[k];
  const horizon = Math.max(1, Math.min(weeks, 10));
  const menus = {} as Record<MenuKey, MenuAdvice>;
  const rest = needsRest(t);
  for (const key of Object.keys(MENUS) as MenuKey[]) {
    const gains = projectGains(t, key, horizon, scale, meal);
    // 弱い能力の伸びを重く,強い能力の伸びを軽く数える
    let score = 0;
    for (const k of ALL_KEYS) score += gains[k] * (1 + Math.max(-0.5, Math.min(1.5, -gap[k] / 12)));
    menus[key] = { menu: key, gains, total: ALL_KEYS.reduce((s, k) => s + gains[k], 0), score };
  }
  // 疲れや不調のときは,ほかのどの練習よりも休養を上に置く
  if (rest.rest) menus.rest.score = Math.max(...(Object.keys(menus) as MenuKey[]).map((k) => menus[k].score)) * 1.2;
  const best = (Object.keys(menus) as MenuKey[]).reduce((a, b) => (menus[b].score > menus[a].score ? b : a));
  let reason: string;
  if (best === 'rest') {
    reason = `${rest.why}.休養で調子と疲れを戻しましょう.`;
  } else {
    const focus = Object.keys(MENUS[best].focus) as AttrKey[];
    const weakest = (focus.length ? focus : ALL_KEYS).reduce((a, b) => (gap[b] < gap[a] ? b : a));
    reason = best === 'mix'
      ? '伸びを偏らせず,全体を底上げするのが効率的です.'
      : gap[weakest] < 0
        ? `${LABEL[weakest]}がリーグ平均より${Math.round(-gap[weakest])}低く,伸ばす余地が大きいメニューです.`
        : `${focus.map((k) => LABEL[k]).join('・')}の伸びしろが大きく,最も効率よく伸ばせます.`;
  }
  return { best, reason, menus, gap };
}

/** プレイヤー以外の,リーグ内の他チームの能力の平均 */
export function leagueAvgAttrs(c: Career, level: number = c.level): Gains {
  const others = leagueTeams(c, level).filter((t) => !t.user);
  const out = zero();
  if (!others.length) return out;
  for (const t of others) { const a = teamAttrs(t); for (const k of ALL_KEYS) out[k] += a[k] / others.length; }
  return out;
}

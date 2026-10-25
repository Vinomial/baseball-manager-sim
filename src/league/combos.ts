/** 選手同士のコンボ.条件がそろうと,試合で小さな追い風になる. */
import { getChem } from '../growth/chemistry';
import type { Player, Team } from '../types';
import { findByPos, findPlayer } from './team';

/** 試合で使う補正.hit/hr/k/dp は確率の足し引き,def は守備力,cmd は制球. */
export interface Fx { hit: number; hr: number; k: number; dp: number; def: number; cmd: number; }
export const noFx = (): Fx => ({ hit: 0, hr: 0, k: 0, dp: 0, def: 0, cmd: 0 });

export interface Combo {
  key: string;
  name: string;
  /** 条件の説明 */
  need: string;
  /** 効果の説明 */
  effect: string;
  active: boolean;
  fx: Partial<Fx>;
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** チームのコンボの一覧(発動していないものも含む).starterId は先発投手. */
export function findCombos(t: Team, starterId?: number): Combo[] {
  const L = t.lineup.map((e) => findPlayer(t, e.pid)).filter((p): p is Player => !!p);
  if (L.length < 9) return [];
  const aSpeed = avg(L.map((p) => p.speed)), aMeet = avg(L.map((p) => p.meet)), aPower = avg(L.map((p) => p.power)), aField = avg(L.map((p) => p.field));
  const out: Combo[] = [];
  const add = (key: string, name: string, need: string, effect: string, active: boolean, fx: Partial<Fx>) => out.push({ key, name, need, effect, active, fx });

  add('table', '出塁コンビ', '1番が俊足,2番がミートに優れている', '安打が出やすくなる',
    L[0].speed >= aSpeed + 6 && L[1].meet >= aMeet + 6, { hit: 0.012 });
  add('cleanup', 'クリーンナップ', '3〜5番のパワーが打線の平均を大きく上回る', '本塁打が出やすくなる',
    avg(L.slice(2, 5).map((p) => p.power)) >= aPower + 8, { hr: 0.02 });
  add('arch', 'アベックアーチ', '長距離砲が2人以上いる', '本塁打が出やすくなる',
    L.filter((p) => p.skills.includes('slugger')).length >= 2, { hr: 0.012 });
  add('speed', '機動力野球', '俊足の選手が3人以上いる', '安打が出やすくなる',
    L.filter((p) => p.skills.includes('runner') || p.speed >= aSpeed + 12).length >= 3, { hit: 0.008 });
  const cat = findByPos(t, '捕');
  const sp = starterId !== undefined ? findPlayer(t, starterId) : t.pitchers[0] !== undefined ? findPlayer(t, t.pitchers[0]) : undefined;
  add('battery', '鉄壁のバッテリー', '捕手と先発投手の連携が深い(60以上)', '制球が安定する',
    !!cat && !!sp && getChem(t, cat.id, sp.id) >= 60, { cmd: 3 });
  const sec = findByPos(t, '二'), ss = findByPos(t, '遊');
  add('keystone', '二遊間の絆', '二塁手と遊撃手の連携が深い(65以上)', '併殺が増え,守備が少し上がる',
    !!sec && !!ss && getChem(t, sec.id, ss.id) >= 65, { dp: 0.05, def: 1.5 });
  const mid = ['捕', '遊', '中'].map((p) => findByPos(t, p as '捕')).filter((p): p is Player => !!p);
  add('center', '鉄壁のセンターライン', '捕手・遊撃手・中堅手の守備がそろって高い', '守備力が上がる',
    mid.length === 3 && mid.every((p) => p.field >= aField + 6), { def: 3 });
  add('gloves', '守備の名手たち', '守備職人が2人以上いる', '守備力が上がる',
    L.filter((p) => p.skills.includes('glove')).length >= 2, { def: 2 });
  const inLineup = new Set(L.map((p) => p.id));
  add('bond', '師弟の絆', '絆(師弟)で結ばれた2人がそろって先発している', '安打が出やすく,制球も安定する',
    t.bonds.some(([a, b]) => inLineup.has(a) && (inLineup.has(b) || b === starterId)), { hit: 0.008, cmd: 1.5 });
  return out;
}

export function sumFx(combos: Combo[]): Fx {
  const f = noFx();
  for (const c of combos) if (c.active) for (const k of Object.keys(c.fx) as (keyof Fx)[]) f[k] += c.fx[k] ?? 0;
  return f;
}

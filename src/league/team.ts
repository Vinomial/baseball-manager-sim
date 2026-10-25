import { LEAGUES, MIN_FIELDERS, MIN_PITCHERS, POS } from '../data/constants';
import { genPlayer, type IdSource } from '../growth/player';
import type { AttrKey, LineupPos, Player, Team } from '../types';
import { ri } from '../util/random';

export interface TeamIdSource extends IdSource { tid: number; }

export const findPlayer = (t: Team, id: number): Player | undefined => t.players.find((p) => p.id === id);

export function getPlayer(t: Team, id: number): Player {
  const p = findPlayer(t, id);
  if (!p) throw new Error(`player ${id} not found in ${t.name}`);
  return p;
}

export function findByPos(t: Team, pos: LineupPos): Player | undefined {
  const e = t.lineup.find((x) => x.pos === pos);
  return e && findPlayer(t, e.pid);
}

export const fielders = (t: Team): Player[] => t.players.filter((p) => p.role === '野手');
export const pitchersOf = (t: Team): Player[] => t.players.filter((p) => p.role === '投手');

export function genTeam(ids: TeamIdSource, name: string, base: number, baseChem: number, user = false): Team {
  const t: Team = { id: ids.tid++, name, user, players: [], lineup: [], pitchers: [], rotIdx: 0, chem: {}, baseChem };
  for (const pos of POS) t.players.push(genPlayer(ids, '野手', base, { pos }));
  for (let i = 0; i < 4; i++) t.players.push(genPlayer(ids, '野手', base - 4));
  for (let i = 0; i < 6; i++) t.players.push(genPlayer(ids, '投手', base - (i >= 3 ? 3 : 0)));
  autoLineup(t);
  autoPitchers(t);
  return t;
}

export const batVal = (p: Player): number => p.meet * 0.55 + p.power * 0.45 + p.speed * 0.1;

/** 守備位置の適性による守備力の補正(0 が本職) */
export function fit(p: Player, pos: LineupPos): number {
  if (pos === '指' || p.pos === pos) return 0;
  if (pos === '捕' || p.pos === '捕') return -35;
  const inf = '一二三遊';
  return inf.includes(pos) === inf.includes(p.pos) ? -12 : -25;
}

export function autoLineup(t: Team): void {
  const F = fielders(t);
  const used = new Set<number>();
  const chosen: { pid: number; pos: LineupPos }[] = [];
  for (const pos of ['捕', '遊', '二', '中', '三', '一', '左', '右'] as LineupPos[]) {
    let best: Player | null = null, bv = -1e9;
    for (const p of F) {
      if (used.has(p.id)) continue;
      const v = batVal(p) + (p.field + fit(p, pos)) * 0.9;
      if (v > bv) { bv = v; best = p; }
    }
    if (best) { used.add(best.id); chosen.push({ pid: best.id, pos }); }
  }
  let dh: Player | null = null;
  for (const p of F) if (!used.has(p.id) && (!dh || batVal(p) > batVal(dh))) dh = p;
  if (dh) chosen.push({ pid: dh.id, pos: '指' });

  const by = (id: number) => getPlayer(t, id);
  const s = [...chosen].sort((a, b) => batVal(by(b.pid)) - batVal(by(a.pid)));
  // 1番は上位5人のうち走力とミートが高い選手
  const lead = [...s.slice(0, 5)].sort((a, b) => (by(b.pid).speed + by(b.pid).meet) - (by(a.pid).speed + by(a.pid).meet))[0];
  const rest = s.filter((e) => e !== lead);
  t.lineup = [lead, rest[3], rest[1], rest[0], rest[2], ...rest.slice(4)].filter(Boolean);
}

export function autoPitchers(t: Team): void {
  const Ps = pitchersOf(t);
  const st = [...Ps].sort((a, b) => (b.velo + b.ctrl + b.stam * 1.2) - (a.velo + a.ctrl + a.stam * 1.2)).slice(0, 3);
  const rest = Ps.filter((p) => !st.includes(p)).sort((a, b) => (b.velo * 1.2 + b.ctrl) - (a.velo * 1.2 + a.ctrl));
  t.pitchers = [...st, ...rest].map((p) => p.id);
}

/** チームの総合力 */
export function ovr(t: Team): number {
  const L = t.lineup.map((e) => findPlayer(t, e.pid)).filter((p): p is Player => !!p);
  const b = L.reduce((s, p) => s + (p.meet + p.power + p.speed + p.field) / 4, 0) / L.length;
  const ps = t.pitchers.slice(0, 5).map((id) => findPlayer(t, id)).filter((p): p is Player => !!p);
  const pv = ps.reduce((s, p) => s + (p.velo + p.ctrl + p.stam) / 3, 0) / ps.length;
  return (b + pv) / 2;
}

/** 能力ごとの平均.打撃系は先発の野手,投手系は先発・中継ぎの上位5人で出す. */
export function teamAttrs(t: Team): Record<AttrKey, number> {
  const L = t.lineup.map((e) => findPlayer(t, e.pid)).filter((p): p is Player => !!p);
  const P = t.pitchers.slice(0, 5).map((id) => findPlayer(t, id)).filter((p): p is Player => !!p);
  const avg = (xs: Player[], k: AttrKey) => (xs.length ? xs.reduce((s, p) => s + p[k], 0) / xs.length : 0);
  return {
    meet: avg(L, 'meet'), power: avg(L, 'power'), speed: avg(L, 'speed'), field: avg(L, 'field'),
    velo: avg(P, 'velo'), ctrl: avg(P, 'ctrl'), stam: avg(P, 'stam'),
  };
}

/* ===== オーダー編集 ===== */

export function swapLineup(t: Team, i: number, j: number): void {
  [t.lineup[i], t.lineup[j]] = [t.lineup[j], t.lineup[i]];
}

/** 打順 i の選手を控えの pid と交代する(守備位置は引き継ぐ) */
export function substitute(t: Team, i: number, pid: number): void {
  t.lineup[i].pid = pid;
}

/** 打順 i の守備位置を変える.同じ位置の選手がいれば入れ替える. */
export function setPosition(t: Team, i: number, pos: LineupPos): void {
  const j = t.lineup.findIndex((x) => x.pos === pos);
  if (j >= 0 && j !== i) t.lineup[j].pos = t.lineup[i].pos;
  t.lineup[i].pos = pos;
}

export function swapPitchers(t: Team, i: number, j: number): void {
  [t.pitchers[i], t.pitchers[j]] = [t.pitchers[j], t.pitchers[i]];
}

export function isLineupValid(t: Team): boolean {
  return t.lineup.length === 9
    && t.lineup.every((e) => findPlayer(t, e.pid)?.role === '野手')
    && new Set(t.lineup.map((e) => e.pos)).size === 9
    && new Set(t.lineup.map((e) => e.pid)).size === 9;
}

/** 人数不足やオーダーの不整合を直す.補充した選手名を返す. */
export function repairTeam(ids: IdSource, t: Team, level: number): string[] {
  const notes: string[] = [];
  const base = LEAGUES[level].base - 10;
  while (fielders(t).length < MIN_FIELDERS) {
    const p = genPlayer(ids, '野手', base, { age: ri(18, 24) });
    t.players.push(p); notes.push(p.name);
  }
  while (pitchersOf(t).length < MIN_PITCHERS) {
    const p = genPlayer(ids, '投手', base, { age: ri(18, 24) });
    t.players.push(p); notes.push(p.name);
  }
  if (!isLineupValid(t)) autoLineup(t);
  const ps = t.pitchers.filter((id) => findPlayer(t, id)?.role === '投手');
  for (const p of pitchersOf(t)) if (!ps.includes(p.id)) ps.push(p.id);
  t.pitchers = ps;
  return notes;
}

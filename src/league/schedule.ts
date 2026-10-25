import type { Career, LeagueState, Standing, Team } from '../types';

/** 総当たり rounds 回戦の日程(円環方式).各週の [ホーム, ビジター] の組を返す. */
export function makeSchedule(ids: number[], rounds = 2): [number, number][][] {
  let a = [...ids];
  const once: [number, number][][] = [];
  for (let r = 0; r < a.length - 1; r++) {
    const pr: [number, number][] = [];
    for (let i = 0; i < a.length / 2; i++) {
      const x = a[i], y = a[a.length - 1 - i];
      pr.push(r % 2 ? [y, x] : [x, y]);
    }
    once.push(pr);
    a = [a[0], a[a.length - 1], ...a.slice(1, a.length - 1)];
  }
  // 1巡ごとにホームとビジターを入れ替える
  const out: [number, number][][] = [];
  for (let k = 0; k < rounds; k++) {
    for (const w of once) out.push(k % 2 ? w.map(([x, y]) => [y, x] as [number, number]) : w);
  }
  return out;
}

export interface StandingRow extends Standing { t: Team; }

const pct = (s: Standing): number => (s.w + s.l ? s.w / (s.w + s.l) : 0);

export const teamById = (c: Career, id: number): Team => {
  const t = c.teams.find((x) => x.id === id);
  if (!t) throw new Error(`team ${id} not found`);
  return t;
};

/** そのチームが今いるリーグ */
export function leagueOfTeam(c: Career, teamId: number): LeagueState {
  const lg = c.leagues.find((l) => l.teamIds.includes(teamId));
  if (!lg) throw new Error(`team ${teamId} has no league`);
  return lg;
}

export const leagueTeams = (c: Career, level: number): Team[] => c.leagues[level].teamIds.map((id) => teamById(c, id));

/** 順位表.level を省略するとプレイヤーのリーグ. */
export function standings(c: Career, level: number = c.level): StandingRow[] {
  const lg = c.leagues[level];
  return lg.teamIds
    .map((id) => ({ t: teamById(c, id), ...lg.stand[id] }))
    .sort((a, b) => pct(b) - pct(a) || b.w - a.w || (b.rf - b.ra) - (a.rf - a.ra));
}

export const emptyStanding = (): Standing => ({ w: 0, l: 0, d: 0, rf: 0, ra: 0 });

import { LEAGUES } from '../data/constants';
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

/**
 * 2 つのリーグ(a,b.同じ数)の日程.同じリーグの相手と rounds 回ずつ,もう一方のリーグの各チームと inter 回ずつ(交流戦).
 * 交流戦は,シーズンの 4 割ほど進んだところでまとめて行う.
 */
export function makeDivSchedule(a: number[], b: number[], rounds: number, inter = 1): [number, number][][] {
  const sa = makeSchedule(a, rounds), sb = makeSchedule(b, rounds);
  const intra = sa.map((w, i) => [...w, ...(sb[i] ?? [])]);
  const cross: [number, number][][] = [];
  for (let k = 0; k < inter; k++) {
    for (let r = 0; r < b.length; r++) {
      cross.push(a.map((x, i) => {
        const y = b[(i + r) % b.length];
        // 週ごとにホームを入れ替える(どのチームも交流戦のホームとビジターが半分ずつ)
        return (r + k) % 2 ? [y, x] : [x, y];
      }));
    }
  }
  const cut = Math.round(intra.length * 0.4);
  return [...intra.slice(0, cut), ...cross, ...intra.slice(cut)];
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

/** プレイヤーのチームがいるリーグ */
export const userLeague = (c: Career): LeagueState => leagueOfTeam(c, c.userId);

/** その階層(草野球,社会人…)にあるリーグ */
export const leaguesInTier = (c: Career, tier: number): LeagueState[] => c.leagues.filter((l) => l.level === tier);

/** リーグのチーム.lg を省略するとプレイヤーのリーグ. */
export const leagueTeams = (c: Career, lg: LeagueState = userLeague(c)): Team[] => lg.teamIds.map((id) => teamById(c, id));

/** 順位表.lg を省略するとプレイヤーのリーグ. */
export function standings(c: Career, lg: LeagueState = userLeague(c)): StandingRow[] {
  return lg.teamIds
    .map((id) => ({ t: teamById(c, id), ...lg.stand[id] }))
    .sort((a, b) => pct(b) - pct(a) || b.w - a.w || (b.rf - b.ra) - (a.rf - a.ra));
}

export const emptyStanding = (): Standing => ({ w: 0, l: 0, d: 0, rf: 0, ra: 0 });

/**
 * 階層のなかの「リーグ」.ふつうは LeagueState そのもの.プロとメジャーは,1 つの LeagueState を東西 2 つのリーグ(divs)に分けたもの.
 * 昇格・降格とプレーオフは,この単位で決まる.
 */
export interface Group { lg: LeagueState; sub: number; ids: number[]; }

export function groupsInTier(c: Career, tier: number): Group[] {
  const out: Group[] = [];
  for (const lg of leaguesInTier(c, tier)) {
    if (lg.divs) lg.divs.forEach((d, i) => out.push({ lg, sub: i, ids: d.filter((id) => lg.teamIds.includes(id)) }));
    else out.push({ lg, sub: lg.sub ?? 0, ids: lg.teamIds });
  }
  return out;
}

/** そのチームがいるリーグ(プロ・メジャーでは東西のどちらか) */
export function groupOf(c: Career, teamId: number): Group {
  const lg = leagueOfTeam(c, teamId);
  return groupsInTier(c, lg.level).find((g) => g.ids.includes(teamId))!;
}

/** リーグの順位表(プロ・メジャーでは東西それぞれ) */
export const groupStandings = (c: Career, g: Group): StandingRow[] => standings(c, g.lg).filter((r) => g.ids.includes(r.t.id));

/** リーグの名前(「草野球リーグ 東」「プロリーグ 西」など) */
export function groupName(g: Group): string {
  const L = LEAGUES[g.lg.level];
  return L.subs && (L.count > 1 || L.divs) ? `${L.name} ${L.subs[g.sub] ?? ''}` : L.name;
}

/** プレイヤーの順位(自分のリーグの中.プロ・メジャーでは東西のどちらかの中) */
export const userRank = (c: Career): number => groupStandings(c, groupOf(c, c.userId)).findIndex((r) => r.t.id === c.userId) + 1;
/** プレイヤーと同じリーグのチーム(プロ・メジャーでは東西のどちらか) */
export const userGroupTeams = (c: Career): Team[] => groupOf(c, c.userId).ids.map((id) => teamById(c, id));

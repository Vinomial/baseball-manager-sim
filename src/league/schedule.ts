import type { Career, Standing, Team } from '../types';

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

export function standings(c: Career): StandingRow[] {
  return c.teams
    .map((t) => ({ t, ...c.stand[t.id] }))
    .sort((a, b) => pct(b) - pct(a) || b.w - a.w || (b.rf - b.ra) - (a.rf - a.ra));
}

export const emptyStanding = (): Standing => ({ w: 0, l: 0, d: 0, rf: 0, ra: 0 });

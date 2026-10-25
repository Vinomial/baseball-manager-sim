/** 球団オーナーの毎年の目標.達成すると信頼度と資金がもらえる. */
import { pick } from '../util/random';
import type { Career, Goal, GoalResult, Review } from '../types';
import { forecast } from './finance';
import { moneyScale } from './economy';
import { leagueTeams, standings } from './schedule';
import { ovr } from './team';

/** 今のチームの強さの順位(総合力で見た順位,1 が最も強い) */
export function expectedRank(c: Career): number {
  return [...leagueTeams(c, c.level)].sort((a, b) => ovr(b) - ovr(a)).findIndex((t) => t.id === c.userId) + 1;
}

/** 新しいシーズンの目標を 2 つ決める.強さに応じて,少し背伸びした目標になる. */
export function makeGoals(c: Career): Goal[] {
  const e = expectedRank(c);
  const m = moneyScale(c);
  const big = (t: number, f: number): { trust: number; funds: number } => ({ trust: t, funds: Math.round((m * f) / 10) * 10 });
  const goals: Goal[] = [];
  if (e <= 2) goals.push({ kind: 'title', target: 1, text: 'リーグ優勝する', reward: big(10, 0.5) });
  else {
    const n = Math.max(1, e - 1);
    goals.push({ kind: 'rank', target: n, text: `リーグ${n}位以内に入る`, reward: big(5 + Math.max(0, e - 3), 0.3) });
  }
  const f = forecast(c, 80);
  const w = Math.max(1, Math.round(f.wins) + 1);
  const others: Goal[] = [
    { kind: 'wins', target: w, text: `${w}勝以上する`, reward: big(4, 0.25) },
    { kind: 'cup', target: 2, text: '全日本選手権で2勝する', reward: big(5, 0.3) },
    { kind: 'grow', target: 25, text: '1人の選手の能力を合計+25以上伸ばす', reward: big(4, 0.25) },
  ];
  goals.push(pick(others));
  return goals;
}

/** 目標の進み具合の表示(シーズン中) */
export function goalProgress(c: Career, g: Goal): string {
  const lg = c.leagues[c.level];
  const st = lg.stand[c.userId];
  const rank = standings(c).findIndex((r) => r.t.id === c.userId) + 1;
  switch (g.kind) {
    case 'rank': return `いま${rank}位(目標${g.target}位以内)`;
    case 'title': return `いま${rank}位`;
    case 'wins': return `いま${st.w}勝(目標${g.target}勝)`;
    case 'cup': return '年末の全日本選手権で判定';
    default: return '年末に判定';
  }
}

/** 1 年の終わりに,目標を判定する.達成したぶんの報酬を渡し,結果を返す. */
export function judgeGoals(c: Career, rank: number, wins: number, ownTitle: boolean, cupWins: number, review: Pick<Review, 'growers'>): GoalResult[] {
  return c.goals.map((g) => {
    let done = false;
    switch (g.kind) {
      case 'rank': done = rank <= g.target; break;
      case 'title': done = ownTitle; break;
      case 'wins': done = wins >= g.target; break;
      case 'cup': done = cupWins >= g.target; break;
      case 'grow': done = (review.growers[0]?.delta ?? 0) >= g.target; break;
    }
    if (done) { c.funds += g.reward.funds; }
    return { text: g.text, done, rewardText: `信頼度+${g.reward.trust} / 資金+${Math.round(g.reward.funds)}万円` };
  });
}

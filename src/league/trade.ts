/** トレードと助っ人. */
import { MIN_FIELDERS, MIN_PITCHERS, LEAGUES, rosterMax } from '../data/constants';
import { futureValue, genPlayer, salaryOf } from '../growth/player';
import type { Career, Player, Team } from '../types';
import { ri } from '../util/random';
import { spend } from './economy';
import { projectedPayroll } from './contracts';
import { budgetFor } from './finance';
import { leagueTeams } from './schedule';
import { addStory } from './story';
import { autoLineup, autoPitchers, fielders, findPlayer, pitchersOf } from './team';

const userRosterMax = (c: Career): number => rosterMax(c.off ? c.off.to : c.level);
const userT = (c: Career): Team => c.teams.find((t) => t.user)!;

/** トレードを受け付ける時期(シーズン中は 9 月前まで,オフはいつでも) */
export const tradeOpen = (c: Career): boolean => c.phase === 'off' || (c.cal < 36 && c.cal >= 0);

/** トレードでの選手の価値(若くて伸びしろがあるほど高い) */
export const tradeValue = (p: Player): number => futureValue(p) + (p.age <= 24 ? 3 : p.age >= 33 ? -4 : 0);

/** 相手が受け入れそうか.出す価値の合計が,ほしい選手の 1.05 倍以上. */
export function tradeRatio(give: Player[], want: Player): number {
  const g = give.reduce((s, p) => s + Math.max(0, tradeValue(p)), 0);
  return g / Math.max(1, tradeValue(want));
}

export function tradeOthers(c: Career): Team[] {
  return leagueTeams(c, c.level).filter((t) => !t.user);
}

/** トレードを行う.できないときは理由を返す. */
export function doTrade(c: Career, teamId: number, wantId: number, giveIds: number[]): string | null {
  if (!tradeOpen(c)) return 'トレードの期限(9月前)を過ぎています.';
  const u = userT(c), o = c.teams.find((t) => t.id === teamId);
  if (!o) return '相手が見つかりません.';
  const want = findPlayer(o, wantId);
  const give = giveIds.map((id) => findPlayer(u, id)).filter((p): p is Player => !!p);
  if (!want) return '選手が見つかりません.';
  if (!give.length) return '出す選手を選んでください.';
  if (tradeRatio(give, want) < 1.05) return '相手は,この条件では受け入れません.出す選手を増やすか,いい選手を足してみましょう.';
  // 人数の下限と上限
  const fAfter = fielders(u).length - give.filter((p) => p.role === '野手').length + (want.role === '野手' ? 1 : 0);
  const pAfter = pitchersOf(u).length - give.filter((p) => p.role === '投手').length + (want.role === '投手' ? 1 : 0);
  if (fAfter < MIN_FIELDERS || pAfter < MIN_PITCHERS) return `野手${MIN_FIELDERS}人・投手${MIN_PITCHERS}人以上が必要です.`;
  if (u.players.length - give.length + 1 > userRosterMax(c)) return '登録人数の上限を超えます.';
  const oF = fielders(o).length + give.filter((p) => p.role === '野手').length - (want.role === '野手' ? 1 : 0);
  const oP = pitchersOf(o).length + give.filter((p) => p.role === '投手').length - (want.role === '投手' ? 1 : 0);
  if (oF < MIN_FIELDERS || oP < MIN_PITCHERS) return '相手チームの人数が足りなくなるため,成立しません.';
  const pay = projectedPayroll(c) - give.reduce((s, p) => s + p.salary, 0) + want.salary;
  if (pay > budgetFor(c)) return '年俸の予算を超えてしまいます.';
  // 入れ替え
  const move = (from: Team, to: Team, p: Player) => {
    from.players = from.players.filter((x) => x !== p);
    from.pitchers = from.pitchers.filter((id) => id !== p.id);
    from.lineup = from.lineup.filter((e) => e.pid !== p.id);
    to.players.push(p);
    if (p.role === '投手') to.pitchers.push(p.id);
  };
  for (const p of give) { move(u, o, p); addStory(c, p, `${u.name}から${o.name}へ移籍した.`); }
  move(o, u, want);
  addStory(c, want, `${o.name}からトレードで入団した.`);
  autoLineup(o); autoPitchers(o);
  if (u.lineup.length < 9) autoLineup(u);
  c.news.push(`トレード成立: ${want.name}を獲得(${give.map((p) => p.name).join(',')}を放出).`);
  return null;
}

/* ===== 助っ人(上のリーグから 1 シーズンだけ借りる選手) ===== */

export const HELPER_LEVEL = 1;

/** 助っ人の年俸は,力のわりに高い */
export const helperSalary = (p: Player): number => Math.round((salaryOf(p) * 1.3) / 10) * 10;

/** 助っ人の候補を作り直す(上のリーグの,円熟した選手) */
export function refreshHelpers(c: Career): void {
  const lv = Math.min(LEAGUES.length - 1, c.level + HELPER_LEVEL);
  c.helpers = Array.from({ length: 3 }, (_, i) => {
    const p = genPlayer(c, i === 2 ? '投手' : '野手', LEAGUES[lv].base + 4, { age: ri(28, 34), potMul: 0.2, foreign: 0.7 });
    p.salary = helperSalary(p);
    p.loan = 1;
    p.prev = '海外・上位リーグ';
    return p;
  });
}

/** 助っ人を雇う.できないときは理由を返す. */
export function hireHelper(c: Career, id: number): string | null {
  const u = userT(c), p = c.helpers.find((x) => x.id === id);
  if (!p) return '候補が見つかりません.';
  if (u.players.length >= userRosterMax(c)) return '登録人数の上限です.';
  if (projectedPayroll(c) + p.salary > budgetFor(c)) return '年俸の予算を超えてしまいます.';
  const fee = Math.round(p.salary * 0.5);
  if (c.funds < fee) return '資金が足りません(契約金が必要です).';
  spend(c, 'hire', fee);
  c.helpers = c.helpers.filter((x) => x !== p);
  u.players.push(p);
  if (p.role === '投手') u.pitchers.push(p.id);
  addStory(c, p, '助っ人として加入した(1シーズン限り).');
  return null;
}

/** 助っ人の契約が終わったら,チームを去る.延長した助っ人は残る. */
export function endLoans(c: Career): string[] {
  const u = userT(c);
  const out: string[] = [];
  for (const p of [...u.players]) {
    if (p.loan === undefined) continue;
    p.loan -= 1;
    if (p.loan > 0) continue;
    u.players = u.players.filter((x) => x !== p);
    u.pitchers = u.pitchers.filter((id) => id !== p.id);
    u.lineup = u.lineup.filter((e) => e.pid !== p.id);
    out.push(`助っ人の${p.name}が契約を終えて,チームを去りました.`);
  }
  return out;
}

/** 助っ人の契約を 1 年延長する(契約金が必要) */
export function extendHelper(c: Career, pid: number): string | null {
  const p = findPlayer(userT(c), pid);
  if (!p || p.loan === undefined) return '助っ人ではありません.';
  const fee = Math.round(p.salary * 0.5);
  if (c.funds < fee) return '資金が足りません.';
  spend(c, 'hire', fee);
  p.loan += 1;
  return null;
}


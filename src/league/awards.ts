/** 表彰,名選手(引退後の殿堂),ライバルと対戦成績.DOM に依存しない. */
import { LEAGUES } from '../data/constants';
import type { AwardRow, Career, LegendRow, Player, Record3, Stats, Team } from '../types';
import { careerStats, fmt3, leaders } from './leaders';
import { leagueTeams } from './schedule';
import { ovr } from './team';

/** シーズンの活躍度.MVP の選出に使う. */
export function seasonScore(p: Player, s: Stats = p.stats): number {
  if (p.role === '野手') return s.h + s.hr * 3 + s.rbi * 1.2 + s.sb * 0.7 + s.bb * 0.4 - (s.ab - s.h) * 0.15;
  return (s.outs / 3) * 0.55 + s.k * 0.2 + s.w * 3 - s.r * 0.9 - (s.ha + s.bba) * 0.1;
}

/** シーズン終了時の表彰.全リーグ分を返す. */
export function computeAwards(c: Career, champIds: Record<number, number>): AwardRow[] {
  const out: AwardRow[] = [];
  const mineIds = new Set(c.teams.find((t) => t.user)!.players.map((p) => p.id));
  const kinds: Record<string, string> = { avg: '首位打者', hr: '本塁打王', rbi: '打点王', sb: '盗塁王', w: '最多勝', era: '最優秀防御率', k: '最多奪三振' };
  for (const lg of c.leagues) {
    const add = (kind: string, p: Player, team: string, text: string) =>
      out.push({ season: c.season, level: lg.level, kind, pid: p.id, name: p.name, team, text, mine: mineIds.has(p.id) });
    for (const b of leaders(c, lg.level, 1)) if (b.rows[0]) add(kinds[b.key], b.rows[0].p, b.rows[0].team, b.rows[0].text);
    // MVP: 優勝チームの選手は少し有利
    let best: { p: Player; t: Team; v: number } | null = null;
    for (const t of leagueTeams(c, lg.level)) {
      for (const p of t.players) {
        const v = seasonScore(p) * (t.id === champIds[lg.level] ? 1.15 : 1);
        if (!best || v > best.v) best = { p, t, v };
      }
    }
    if (best && best.v > 0) add('MVP', best.p, best.t.name, best.p.role === '野手'
      ? `${best.p.stats.hr}本 ${best.p.stats.rbi}打点 打率${best.p.stats.ab ? fmt3(best.p.stats.h / best.p.stats.ab) : '---'}`
      : `${best.p.stats.w}勝 ${best.p.stats.k}奪三振`);
  }
  return out;
}

/** 引退した選手の通算成績の文章と点数 */
export function legendOf(c: Career, p: Player, team: Team): LegendRow {
  const s = careerStats(p, false);
  const bat = p.role === '野手';
  const score = bat ? s.h + s.hr * 4 + s.rbi * 0.5 + s.sb * 0.5 : s.w * 6 + s.k * 0.4 + s.outs / 3 * 0.1;
  const line = bat
    ? `通算${s.g}試合 打率${s.ab ? fmt3(s.h / s.ab) : '---'} ${s.hr}本塁打 ${s.rbi}打点 ${s.sb}盗塁`
    : `通算${s.g}登板 ${s.w}勝${s.l}敗 防御率${s.outs ? ((s.r * 27) / s.outs).toFixed(2) : '-.--'} ${s.k}奪三振`;
  return {
    name: p.name, pos: p.pos, team: team.name, lastSeason: c.season, years: p.seasons.length,
    level: Math.max(0, ...p.seasons.map((x) => x.level)), line, score, mine: team.user,
  };
}

/** 引退した選手のうち,名選手として残すもの.最大 60 人,点数の高い順. */
export function addLegend(c: Career, p: Player, team: Team): void {
  if (p.seasons.length < 3) return;
  const row = legendOf(c, p, team);
  const min = 60 * (1 + row.level * 0.3);
  if (row.score < min && !row.mine) return;
  c.legends.push(row);
  c.legends.sort((a, b) => b.score - a.score);
  if (c.legends.length > 60) c.legends.length = 60;
}

/* ===== ライバルと対戦成績 ===== */

export const zeroRec = (): Record3 => ({ w: 0, l: 0, d: 0 });

export function recordGame(c: Career, oppId: number, us: number, them: number): void {
  const r = (c.h2h[oppId] ??= zeroRec());
  if (us > them) r.w++; else if (us < them) r.l++; else r.d++;
}

/** ライバルを決める.同じリーグにいる間は同じチーム.いなくなったら,いちばん強い他チーム. */
export function pickRival(c: Career): void {
  const others = leagueTeams(c, c.level).filter((t) => !t.user);
  if (c.rival !== null && others.some((t) => t.id === c.rival)) return;
  c.rival = others.length ? others.reduce((a, b) => (ovr(b) > ovr(a) ? b : a)).id : null;
}

export const levelName = (l: number): string => LEAGUES[l].name;

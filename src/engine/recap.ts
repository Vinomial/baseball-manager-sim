/** 試合後の戦評とボックススコア.DOM に依存しない. */
import type { Game, LineupPos, Player, Side, Stats } from '../types';

export interface BoxBat { p: Player; pos: LineupPos; ab: number; h: number; hr: number; rbi: number; bb: number; so: number; sb: number; }
export interface BoxPit { p: Player; outs: number; r: number; k: number; ha: number; bba: number; note: '勝' | '負' | ''; }
export interface Box { bat: BoxBat[]; pit: BoxPit[]; }

const d = (g: Game, p: Player, k: keyof Stats): number => p.stats[k] - (g.snap[p.id]?.[k] ?? 0);

export function boxScore(g: Game, s: Side): Box {
  const other = s === g.home ? g.away : g.home;
  const won = s.runs > other.runs, lost = s.runs < other.runs;
  return {
    bat: s.lineup.map((e) => ({
      p: e.p, pos: e.pos, ab: d(g, e.p, 'ab'), h: d(g, e.p, 'h'), hr: d(g, e.p, 'hr'),
      rbi: d(g, e.p, 'rbi'), bb: d(g, e.p, 'bb'), so: d(g, e.p, 'so'), sb: d(g, e.p, 'sb'),
    })),
    pit: s.used.map((p) => ({
      p, outs: d(g, p, 'outs'), r: d(g, p, 'r'), k: d(g, p, 'k'), ha: d(g, p, 'ha'), bba: d(g, p, 'bba'),
      note: p === s.starter ? (won ? '勝' : lost ? '負' : '') : '',
    })),
  };
}

/** 投球回の表記(例: 6回1/3) */
export function fmtIP(outs: number): string {
  const f = outs % 3;
  return `${Math.floor(outs / 3)}${f ? `回${f}/3` : '回'}`;
}

export interface Recap {
  headline: string;
  /** 戦評の本文 */
  lines: string[];
  mvp: { name: string; text: string } | null;
}

/** 活躍度.MVP の選出に使う. */
function score(b: BoxBat | BoxPit, isPit: boolean): number {
  if (isPit) {
    const x = b as BoxPit;
    return x.outs / 3 * 1.6 - x.r * 2.2 + x.k * 0.5 - x.ha * 0.3 - x.bba * 0.4 + (x.note === '勝' ? 2 : 0);
  }
  const x = b as BoxBat;
  return x.h * 2 + x.hr * 3 + x.rbi * 2.2 + x.bb * 0.6 + x.sb * 0.8 - (x.ab - x.h) * 0.3;
}

function batText(x: BoxBat): string {
  const parts = [`${x.ab}打数${x.h}安打`];
  if (x.hr) parts.push(`${x.hr}本塁打`);
  if (x.rbi) parts.push(`${x.rbi}打点`);
  if (x.sb) parts.push(`${x.sb}盗塁`);
  return parts.join(',');
}

export function recap(g: Game): Recap {
  const win = g.home.runs === g.away.runs ? null : g.home.runs > g.away.runs ? g.home : g.away;
  const lose = win ? (win === g.home ? g.away : g.home) : null;
  const total = g.home.runs + g.away.runs;
  const lines: string[] = [];

  if (!win || !lose) {
    return { headline: `${g.inning}回を戦って引き分け`, lines: [`両チームとも決め手を欠き,${g.away.runs}対${g.home.runs}で引き分けました.`], mvp: null };
  }

  // 展開
  const chron = [...g.log].reverse();
  const winScore = (e: { a: number; h: number }) => (win === g.home ? e.h : e.a);
  const loseScore = (e: { a: number; h: number }) => (win === g.home ? e.a : e.h);
  const trailed = chron.some((e) => winScore(e) < loseScore(e));
  const maxLead = Math.max(0, ...chron.map((e) => winScore(e) - loseScore(e)));
  const walkoff = chron.some((e) => e.t === 'サヨナラ!');
  const margin = win.runs - lose.runs;

  let headline: string;
  if (walkoff) headline = `${win.team.name}がサヨナラ勝ち`;
  else if (lose.runs === 0 && total <= 4) headline = `${win.team.name}が投手戦を制して完封勝ち`;
  else if (lose.runs === 0) headline = `${win.team.name}が完封勝ち`;
  else if (g.inning > 9) headline = `${win.team.name}が延長${g.inning}回の接戦を制す`;
  else if (trailed && maxLead >= 1 && margin <= 3) headline = `${win.team.name}が逆転勝ち`;
  else if (total >= 15) headline = `${win.team.name}が打撃戦を制す`;
  else if (margin >= 7) headline = `${win.team.name}が大勝`;
  else if (margin === 1) headline = `${win.team.name}が1点差で逃げ切る`;
  else headline = `${win.team.name}が勝利`;

  // 決勝点
  const key = chron.find((e) => winScore(e) > lose.runs);
  if (key) {
    const play = key.t.replace(/ \d+点!.*$/, '').replace(/\(.*?\)/g, '').replace(/[.!]$/, '');
    lines.push(`決勝点は${key.tag},${play}.`);
  }

  // 投手
  const wb = boxScore(g, win), lb = boxScore(g, lose);
  const ws = wb.pit.find((x) => x.p === win.starter), ls = lb.pit.find((x) => x.p === lose.starter);
  if (ws) {
    const full = win.used.length === 1;
    lines.push(full && lose.runs === 0
      ? `${ws.p.name}が${fmtIP(ws.outs)}を投げ,${ws.ha}安打${ws.k}奪三振の完封でした.`
      : full ? `${ws.p.name}が完投し,${fmtIP(ws.outs)}を${ws.r}失点にまとめました.`
        : `先発の${ws.p.name}は${fmtIP(ws.outs)}を${ws.r}失点${ws.k}奪三振で勝ち投手になりました.`);
  }
  if (ls && ls.r >= 4) lines.push(`${lose.team.name}の先発${ls.p.name}は${fmtIP(ls.outs)}を投げて${ls.r}失点と打ち込まれました.`);
  if (lose.hits === 0) lines.push(`${win.team.name}の投手陣が相手打線をノーヒットに抑えました!`);

  // 打線
  const bats = [...wb.bat, ...lb.bat];
  const stars = bats.filter((x) => x.hr >= 2 || x.h >= 3 || x.rbi >= 4);
  for (const x of stars.slice(0, 2)) lines.push(`${x.p.name}が${batText(x)}の活躍.`);
  const hrs = bats.reduce((s, x) => s + x.hr, 0);
  if (hrs >= 4) lines.push(`両チーム合わせて${hrs}本塁打が飛び出しました.`);

  // MVP(勝った側から)
  const cands: { name: string; sc: number; text: string }[] = [
    ...wb.bat.map((x) => ({ name: x.p.name, sc: score(x, false), text: batText(x) })),
    ...wb.pit.map((x) => ({ name: x.p.name, sc: score(x, true), text: `${fmtIP(x.outs)} ${x.r}失点 ${x.k}奪三振` })),
  ].sort((a, b) => b.sc - a.sc);
  const top = cands[0];
  return {
    headline,
    lines: lines.slice(0, 5),
    mvp: top ? { name: top.name, text: top.text } : null,
  };
}

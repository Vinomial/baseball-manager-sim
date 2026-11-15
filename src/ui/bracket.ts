/** トーナメント表(SVG).全日本選手権の準々決勝から決勝,リーグのプレーオフを描く. */
import { cupRoundName } from '../league/calendar';
import { teamById } from '../league/schedule';
import type { Career, LeagueState } from '../types';
import { esc } from '../util/format';
import { emblemChar, teamColors } from './emblem';

export interface Side { id: number | null; name: string; score?: number; }
export interface Match { a: Side; b: Side; winner?: number | null; }

/** 表に入る短い名前.「ニューヨーク・キングス」は「キングス」にする. */
const short = (s: string, n = 5): string => {
  const t = s.includes('・') ? s.split('・').pop()! : s;
  return [...t].length > n ? [...t].slice(0, n - 1).join('') + '…' : t;
};

/**
 * 勝ち上がりの表.cols[0] が最初の回戦で,1 つ右へ進むごとに試合数が半分になる.
 * champion を渡すと,いちばん右に優勝チームを描く.
 */
export function bracketSVG(cols: Match[][], titles: string[], userId: number, champion?: Side): string {
  const first = cols[0]?.length ?? 0;
  if (!first) return '';
  const boxW = 86, boxH = 18, gapX = 10, slot = 24, padTop = 18;
  const W = cols.length * (boxW + gapX) + (champion ? boxW : 0) + 4;
  const H = padTop + first * 2 * slot + 4;
  // 各回戦の,各チームの枠の中心の y
  const ys: number[][] = [];
  ys[0] = Array.from({ length: first * 2 }, (_, i) => padTop + i * slot + slot / 2);
  for (let j = 1; j <= cols.length; j++) {
    const prev = ys[j - 1];
    ys[j] = Array.from({ length: prev.length / 2 }, (_, i) => (prev[i * 2] + prev[i * 2 + 1]) / 2);
  }
  const box = (x: number, y: number, s: Side, win: boolean | null) => {
    const me = s.id === userId;
    const [bg, ink] = s.id !== null ? teamColors({ name: s.name }) : ['#888', '#fff'];
    const fade = win === false ? ' opacity=".45"' : '';
    return `<g${fade}><rect x="${x}" y="${y - boxH / 2}" width="${boxW}" height="${boxH}" rx="3" fill="var(--panel)" stroke="${me ? 'var(--sel)' : 'var(--line)'}" stroke-width="${me ? 2.5 : 1}"/>
      ${s.id !== null ? `<rect x="${x + 2}" y="${y - 7}" width="14" height="14" rx="2" fill="${bg}"/><text x="${x + 9}" y="${y + 4}" font-size="9" fill="${ink}" text-anchor="middle">${esc(emblemChar(s.name))}</text>` : ''}
      <text x="${x + 19}" y="${y + 4}" font-size="9" fill="var(--ink)" ${me || win ? 'font-weight="700"' : ''}>${esc(short(s.name))}</text>
      ${s.score !== undefined ? `<text x="${x + boxW - 4}" y="${y + 4}" font-size="9.5" fill="${win ? 'var(--good)' : 'var(--muted)'}" text-anchor="end">${s.score}</text>` : ''}</g>`;
  };
  let svg = '';
  cols.forEach((col, j) => {
    const x = 2 + j * (boxW + gapX);
    svg += `<text x="${x + boxW / 2}" y="11" font-size="9" fill="var(--muted)" text-anchor="middle">${esc(titles[j] ?? '')}</text>`;
    col.forEach((m, i) => {
      const ya = ys[j][i * 2], yb = ys[j][i * 2 + 1], yn = ys[j + 1][i];
      const done = m.winner !== undefined && m.winner !== null;
      svg += box(x, ya, m.a, done ? m.winner === m.a.id : null) + box(x, yb, m.b, done ? m.winner === m.b.id : null);
      // 次の回戦へつなぐ線.勝った側を太く.
      const xr = x + boxW, xm = xr + gapX / 2, xn = xr + gapX;
      const wy = done ? (m.winner === m.a.id ? ya : yb) : null;
      svg += `<path d="M${xr} ${ya}H${xm}V${yb}H${xr}M${xm} ${yn}H${xn}" fill="none" stroke="var(--line)" stroke-width="1.5"/>`;
      if (wy !== null) svg += `<path d="M${xr} ${wy}H${xm}V${yn}H${xn}" fill="none" stroke="${m.winner === userId ? 'var(--sel)' : 'var(--btn)'}" stroke-width="2.5"/>`;
    });
  });
  if (champion) {
    const x = 2 + cols.length * (boxW + gapX), y = ys[cols.length][0];
    svg += `<text x="${x + boxW / 2}" y="11" font-size="9" fill="var(--accent)" text-anchor="middle">優勝</text>${box(x, y, champion, true)}
      <text x="${x + boxW / 2}" y="${y - 14}" font-size="12" text-anchor="middle">🏆</text>`;
  }
  return `<div class="bracket"><svg viewBox="0 0 ${W} ${H}" style="max-width:${W}px" role="img" aria-label="トーナメント表" font-family="DotGothic16, sans-serif">${svg}</svg></div>`;
}

/** 全日本選手権の準々決勝から先.まだなら,決まっている組み合わせだけ描く. */
export function cupBracketSVG(c: Career): string {
  const ROUNDS = ['準々決勝', '準決勝', '決勝'];
  const name = (id: number | null): Side => (id === null ? { id: null, name: '未定' } : { id, name: teamById(c, id).name });
  const cols: Match[][] = ROUNDS.map((r) => c.cupBracket.filter((m) => m.round === r).map((m) => ({
    a: { id: m.aId, name: m.a, score: m.sa }, b: { id: m.bId, name: m.b, score: m.sb }, winner: m.winner,
  })));
  // 準々決勝がまだなら,8 チームが決まったところで組み合わせを出す
  const cup = c.cup;
  if (!cols[0].length && cup && cup.slots.length === 8 && cupRoundName(cup.round) === '準々決勝') {
    cols[0] = Array.from({ length: 4 }, (_, i) => ({ a: name(cup.slots[i * 2]), b: name(cup.slots[i * 2 + 1]) }));
  }
  if (!cols[0].length) return '';
  // 後の回戦の空きを「未定」で埋める
  for (let j = 1; j < cols.length; j++) {
    if (cols[j].length) continue;
    const prev = cols[j - 1];
    cols[j] = Array.from({ length: prev.length / 2 }, (_, i) => {
      const w = (m: Match | undefined) => (m?.winner !== undefined && m.winner !== null ? name(m.winner) : { id: null, name: '未定' });
      return { a: w(prev[i * 2]), b: w(prev[i * 2 + 1]) };
    });
  }
  const f = cols[2][0];
  const champ = f?.winner !== undefined && f.winner !== null ? name(f.winner) : undefined;
  return bracketSVG(cols, ROUNDS, c.userId, champ);
}

/** リーグのプレーオフ(上位 4 チーム) */
export function playoffBracketSVG(c: Career, lg: LeagueState): string {
  const po = lg.po;
  if (!po || po.seeds.length < 4) return '';
  const T = (id: number | null): Side => (id === null ? { id: null, name: '未定' } : { id, name: teamById(c, id).name });
  const semis: Match[] = [[0, 3], [1, 2]].map(([x, y], i) => ({ a: T(po.seeds[x]), b: T(po.seeds[y]), winner: po.semiWinners[i] ?? null }));
  const final: Match = { a: T(po.semiWinners[0] ?? null), b: T(po.semiWinners[1] ?? null), winner: po.champion };
  return bracketSVG([semis, [final]], ['準決勝', '決勝'], c.userId, po.champion !== null ? T(po.champion) : undefined);
}

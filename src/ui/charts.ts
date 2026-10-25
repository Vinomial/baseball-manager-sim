/** グラフ(SVG).色は CSS の変数から取り,ライト/ダークの両方で読める. */
import { esc } from '../util/format';

export interface Series {
  name: string;
  color: string;
  dash?: string;
  values: number[];
}

const NS = 'xmlns="http://www.w3.org/2000/svg"';

/** レーダーチャート.0〜100 の値を軸ごとに描く. */
export function radarSVG(labels: string[], series: Series[]): string {
  const cx = 130, cy = 120, R = 82, n = labels.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number) => {
    const r = (Math.max(0, Math.min(100, v)) / 100) * R;
    return [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r] as const;
  };
  const poly = (f: (i: number) => readonly [number, number]) => labels.map((_, i) => f(i).map((x) => x.toFixed(1)).join(',')).join(' ');
  const rings = [25, 50, 75, 100].map((g) =>
    `<polygon points="${poly((i) => pt(i, g))}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('');
  const spokes = labels.map((_, i) => { const [x, y] = pt(i, 100); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/>`; }).join('');
  const names = labels.map((l, i) => {
    const [x, y] = pt(i, 100);
    const dx = Math.cos(ang(i)) * 14, dy = Math.sin(ang(i)) * 14 + 4;
    const anchor = Math.abs(Math.cos(ang(i))) < 0.2 ? 'middle' : Math.cos(ang(i)) > 0 ? 'start' : 'end';
    return `<text x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" font-size="12" text-anchor="${anchor}" fill="var(--ink)">${esc(l)}</text>`;
  }).join('');
  const shapes = series.map((s) =>
    `<polygon points="${poly((i) => pt(i, s.values[i]))}" fill="${s.color}" fill-opacity="${s.dash ? 0.06 : 0.22}" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`).join('');
  const dots = series.map((s) => s.values.map((v, i) => {
    const [x, y] = pt(i, v);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${s.color}" stroke="var(--panel)" stroke-width="2"><title>${esc(s.name)} ${esc(labels[i])}: ${Math.round(v)}</title></circle>`;
  }).join('')).join('');
  const label = `${series.map((s) => s.name).join(' と ')}の能力レーダー: ${labels.map((l, i) => `${l} ${series.map((s) => Math.round(s.values[i])).join('/')}`).join(',')}`;
  return `<svg ${NS} viewBox="0 0 260 240" role="img" aria-label="${esc(label)}" class="chart">${rings}${spokes}${shapes}${dots}${names}</svg>`;
}

/** 折れ線グラフ.x は 0..n-1 の等間隔.marks は x 位置に縦線と注釈を入れる. */
export function lineSVG(series: Series[], opts: { marks?: { x: number; text: string }[]; yMin?: number; yMax?: number } = {}): string {
  const W = 320, H = 170, L = 30, Rr = 8, T = 10, B = 22;
  const n = Math.max(...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values);
  let lo = opts.yMin ?? Math.floor((Math.min(...all) - 2) / 5) * 5;
  let hi = opts.yMax ?? Math.ceil((Math.max(...all) + 2) / 5) * 5;
  if (hi - lo < 10) hi = lo + 10;
  lo = Math.max(0, lo);
  const X = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - Rr));
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const step = (hi - lo) / 4;
  const grid = [0, 1, 2, 3, 4].map((k) => {
    const v = lo + step * k;
    return `<line x1="${L}" x2="${W - Rr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 4}" y="${(Y(v) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--muted)">${Math.round(v)}</text>`;
  }).join('');
  const marks = (opts.marks ?? []).map((m) =>
    `<line x1="${X(m.x).toFixed(1)}" x2="${X(m.x).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="2 3"/><text x="${(X(m.x) + 3).toFixed(1)}" y="${T + 9}" font-size="10" fill="var(--muted)">${esc(m.text)}</text>`).join('');
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const last = s.values.length - 1;
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(last).toFixed(1)}" cy="${Y(s.values[last]).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--panel)" stroke-width="2"><title>${esc(s.name)}: ${s.values[last].toFixed(1)}</title></circle>`;
  }).join('');
  const label = series.map((s) => `${s.name} ${s.values[0].toFixed(0)} から ${s.values[s.values.length - 1].toFixed(0)}`).join(',');
  return `<svg ${NS} viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" class="chart">${grid}${marks}${lines}<text x="${L}" y="${H - 6}" font-size="10" fill="var(--muted)">古い</text><text x="${W - Rr}" y="${H - 6}" font-size="10" text-anchor="end" fill="var(--muted)">最新</text></svg>`;
}

export function legendHTML(series: Series[]): string {
  return `<div class="legend">${series.map((s) =>
    `<span><svg ${NS} width="22" height="8" aria-hidden="true"><line x1="1" x2="21" y1="4" y2="4" stroke="${s.color}" stroke-width="3" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linecap="round"/></svg>${esc(s.name)}</span>`).join('')}</div>`;
}

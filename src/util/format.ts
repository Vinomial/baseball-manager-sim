export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export function grade(v: number): Grade {
  v = Math.round(v);
  return v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : v >= 50 ? 'D' : v >= 40 ? 'E' : v >= 20 ? 'F' : 'G';
}

export function fmtAvg(h: number, ab: number): string {
  if (!ab) return '---';
  const a = h / ab;
  return a >= 1 ? '1.000' : '.' + String(Math.round(a * 1000)).padStart(3, '0');
}

export function fmtEra(r: number, outs: number): string {
  return outs ? ((r * 27) / outs).toFixed(2) : '-.--';
}

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

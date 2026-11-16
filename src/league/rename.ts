/**
 * 選手とチームの名前を変える.過去の記録(優勝の歴史や表彰)は,そのときの名前のまま残す.DOM に依存しない.
 */
import type { Career } from '../types';

export const NAME_MAX = 12;

/** 前後の空白をとり,長さを確かめる.問題があれば理由を返す. */
function check(raw: string): { name: string } | { error: string } {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { error: '名前を入れてください.' };
  if ([...name].length > NAME_MAX) return { error: `名前は${NAME_MAX}文字までです.` };
  return { name };
}

/** 選手の名前を変える(どのチームの選手でも,自由契約の選手でも).できなければ理由を返す. */
export function renamePlayer(c: Career, id: number, raw: string): string | null {
  const r = check(raw);
  if ('error' in r) return r.error;
  const p = c.teams.flatMap((t) => t.players).find((x) => x.id === id) ?? c.fa.find((x) => x.id === id);
  if (!p) return '選手が見つかりません.';
  p.name = r.name;
  return null;
}

/** チームの名前を変える.ほかのチームと同じ名前にはできない.できなければ理由を返す. */
export function renameTeam(c: Career, id: number, raw: string): string | null {
  const r = check(raw);
  if ('error' in r) return r.error;
  const t = c.teams.find((x) => x.id === id);
  if (!t) return 'チームが見つかりません.';
  if (c.teams.some((x) => x.id !== id && x.name === r.name)) return 'ほかのチームと同じ名前です.';
  t.name = r.name;
  return null;
}

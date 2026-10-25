/** 結果の共有.文章をコピー(または共有)したり,画像にして保存したりできる. */
import { LEAGUES } from '../data/constants';
import type { Career } from '../types';

/** 1 年の結果の文章 */
export function seasonText(c: Career): string {
  const o = c.off;
  if (!o) return '';
  const r = o.review;
  const lg = LEAGUES[o.from].name;
  const lines = [
    `【ダイヤモンド監督】第${c.season}シーズン ${lg}`,
    `${o.rank}位 ${o.rec.w}勝${o.rec.l}敗${o.rec.d}分 / ${o.playoff}`,
    r?.ownTitle ? `🏆 ${lg}で優勝!` : '',
    o.move > 0 ? `⬆ ${LEAGUES[o.to].name}へ昇格!` : o.move < 0 ? `⬇ ${LEAGUES[o.to].name}へ降格` : '',
    `全日本選手権: ${o.cup}`,
    r?.mvp ? `MVP: ${r.mvp.name}(${r.mvp.team})` : '',
    `実績 ${Object.keys(c.ach).length}個 / 通算${c.rec.total.w}勝`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** 直近の試合の結果の文章 */
export function gameText(c: Career, home: string, away: string, hs: number, as: number, headline: string): string {
  return [`【ダイヤモンド監督】第${c.season}シーズン`, `${away} ${as} - ${hs} ${home}`, headline].join('\n');
}

/** 文章を共有する.共有メニューが使えなければ,クリップボードにコピーする.結果の説明を返す. */
export async function shareText(text: string): Promise<string> {
  try {
    if (typeof navigator !== 'undefined' && 'share' in navigator) { await navigator.share({ text }); return '共有しました'; }
  } catch { /* 取り消しなど.コピーに切り替える */ }
  try { await navigator.clipboard.writeText(text); return 'コピーしました'; } catch { return 'コピーできませんでした'; }
}

/** 結果の画像(PNG)を作る */
export function seasonImage(c: Career): Promise<Blob | null> {
  const o = c.off;
  if (!o || typeof document === 'undefined') return Promise.resolve(null);
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 360;
  const g = cv.getContext('2d');
  if (!g) return Promise.resolve(null);
  g.fillStyle = '#163225'; g.fillRect(0, 0, 640, 360);
  g.strokeStyle = '#2C4E3C'; g.lineWidth = 8; g.strokeRect(4, 4, 632, 352);
  const f = (px: number) => `${px}px "DotGothic16", "Hiragino Sans", "Noto Sans JP", sans-serif`;
  g.fillStyle = '#EDEBE0'; g.font = f(30); g.fillText('ダイヤモンド監督', 32, 60);
  g.fillStyle = '#F5C84C'; g.font = f(22); g.fillText(`第${c.season}シーズン ${LEAGUES[o.from].name}`, 32, 100);
  g.fillStyle = '#EDEBE0'; g.font = f(48); g.fillText(`${o.rank}位  ${o.rec.w}勝${o.rec.l}敗${o.rec.d}分`, 32, 170);
  g.font = f(24);
  const out = [o.review?.ownTitle ? `🏆 ${LEAGUES[o.from].name} 優勝!` : o.playoff, o.move > 0 ? `⬆ ${LEAGUES[o.to].name}へ昇格` : '', `全日本選手権: ${o.cup}`].filter(Boolean);
  out.forEach((t, i) => g.fillText(t, 32, 215 + i * 36));
  g.fillStyle = '#9fb3a5'; g.font = f(16); g.fillText(`${c.teams.find((t) => t.user)?.name ?? ''} / 実績 ${Object.keys(c.ach).length}個`, 32, 335);
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

/** 画像を共有または保存する */
export async function shareImage(c: Career): Promise<string> {
  const blob = await seasonImage(c);
  if (!blob) return '画像を作れませんでした';
  const file = new File([blob], `diamond-kantoku-s${c.season}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return '共有しました'; }
  } catch { /* 保存に切り替える */ }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
  return '画像を保存しました';
}

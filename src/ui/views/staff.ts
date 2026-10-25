import { fmtYen } from '../../league/finance';
import { ROLES, ROLE_INFO, STYLE_INFO, severance, signingBonus, staffCost, staffStars } from '../../league/staff';
import type { Career, Staff } from '../../types';
import { esc } from '../../util/format';
import { starsHTML } from '../components';
import { state } from '../state';

function effectText(s: Staff): string {
  const e = Math.round(((s.skill - 50) / 50) * 12);
  switch (s.role) {
    case 'batting': return `ミート・パワーの伸び ${e >= 0 ? '+' : ''}${e}%`;
    case 'pitching': return `球威・制球の伸び ${e >= 0 ? '+' : ''}${e}%`;
    case 'defense': return `守備・走力の伸び ${e >= 0 ? '+' : ''}${e}%`;
    case 'trainer': return `スタミナの伸び ${e >= 0 ? '+' : ''}${e}% / 怪我 ${Math.round(((50 - s.skill) / 50) * 25)}% / 疲れ ${Math.round(((50 - s.skill) / 50) * 15)}%`;
    case 'mental': return `やる気が毎週 ${(((s.skill - 50) / 50) * 0.9).toFixed(1)} ずつ動く`;
    default: return s.style ? STYLE_INFO[s.style].desc : '';
  }
}

/** いまの人と比べた,伸びの違い(空席は標準 0%) */
function preview(s: Staff, cur: Staff | null): string {
  if (s.role === 'manager') return '';
  const now = cur ? Math.round(((cur.skill - 50) / 50) * 12) : 0;
  const after = Math.round(((s.skill - 50) / 50) * 12);
  const d = after - now;
  return `<br><span class="small ${d >= 0 ? 'up' : 'dn'}">雇うと,担当の伸びが いま ${now >= 0 ? '+' : ''}${now}% → ${after >= 0 ? '+' : ''}${after}%(${d >= 0 ? '+' : ''}${d})</span>`;
}

function staffRow(s: Staff, extra: string): string {
  return `<div class="top"><span class="nm">${esc(s.name)}<span class="tag">${s.age}歳</span>${s.style ? `<span class="tag">${STYLE_INFO[s.style].name}</span>` : ''}</span><span class="small">${starsHTML(staffStars(s.skill), 'ovr', '能力')}</span></div>
  <span class="small">${esc(effectText(s))}</span><br><span class="small muted">年俸 ${fmtYen(s.salary)}${extra}</span>`;
}

/** スタッフ.あなたはGMとして,監督とコーチを雇う. */
export function renderStaff(c: Career): string {
  let h = `<div class="card"><p style="margin:0"><b>あなたはGM(ゼネラルマネージャー)です</b></p>
  <p class="small muted" style="margin:4px 0 0">監督とコーチを雇って,チームを動かしましょう.空席のあいだは,効果は標準です.能力の低い人を雇うと,かえって逆効果になります.年俸は毎週,資金から払います.</p>
  <div class="chem" style="margin-top:6px"><span class="who">資金 ${fmtYen(c.funds)}</span><span class="small muted">スタッフの年俸の合計 ${fmtYen(staffCost(c))}</span></div></div>`;
  for (const r of ROLES) {
    const cur = c.staff[r];
    const cands = c.staffPool.filter((x) => x.role === r).sort((a, b) => b.skill - a.skill);
    h += `<h2>${ROLE_INFO[r].name}</h2><p class="small muted" style="margin:0 0 6px">${ROLE_INFO[r].desc}</p>`;
    h += cur
      ? `<div class="pl star">${staffRow(cur, `(在任${cur.years}年)`)}<div style="margin-top:6px"><button class="btn danger" data-a="fire" data-k="${r}" ${c.funds < severance(cur) ? 'disabled' : ''}>解雇する(退職金 ${fmtYen(severance(cur))})</button></div></div>`
      : '<div class="pl"><span class="small muted">空席です.</span></div>';
    h += `<details class="fold card" data-fold="staff-${r}" ${state.folds[`staff-${r}`] ? 'open' : ''} style="margin-top:6px"><summary><b>候補を見る</b> <span class="small muted">${cands.length}人</span></summary><div class="fold-body"><div class="plist">${cands.map((s) => {
      const need = signingBonus(s) + (cur ? severance(cur) : 0);
      return `<div class="pl">${staffRow(s, `/ 契約金 ${fmtYen(signingBonus(s))}${cur ? ` + 退職金 ${fmtYen(severance(cur))}` : ''}`)}${preview(s, cur)}<div style="margin-top:6px"><button class="btn" data-a="hire" data-id="${s.id}" ${c.funds < need ? 'disabled' : ''}>${cur ? '入れ替える' : '雇う'}</button></div></div>`;
    }).join('') || '<p class="small muted">候補はいません.来シーズンに新しい候補が出ます.</p>'}</div></div></details>`;
  }
  return h;
}

import { LEAGUES } from '../../data/constants';
import { standings } from '../../league/schedule';
import type { Career } from '../../types';
import { esc } from '../../util/format';

export function renderTable(c: Career): string {
  const top = c.level === LEAGUES.length - 1;
  return `<h2>${LEAGUES[c.level].name} 順位表</h2><p class="small muted">${top ? 'プロリーグが最上位です.最下位は降格.' : `上位2チームは昇格${c.level === 0 ? '.' : ',最下位は降格.'}`}</p>
  <div class="card scroll"><table class="std"><thead><tr><th>順位</th><th>チーム</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>得失点</th></tr></thead><tbody>
  ${standings(c).map((r, i) => `<tr class="${r.t.user ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.t.name)}</td><td>${r.w + r.l + r.d}</td><td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td>${r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3) : '---'}</td><td>${r.rf - r.ra > 0 ? '+' : ''}${r.rf - r.ra}</td></tr>`).join('')}
  </tbody></table></div>`;
}

import { ALL_KEYS, BAT_KEYS, LABEL, LEAGUES, PIT_KEYS } from '../../data/constants';
import { ovr, teamAttrs } from '../../league/team';
import { userTeam } from '../../league/season';
import type { AttrKey, Career } from '../../types';
import { esc } from '../../util/format';
import { legendHTML, lineSVG, radarSVG, type Series } from '../charts';
import { gradeHTML } from '../components';

const MINE = 'var(--btn)';
const LEAGUE = 'var(--accent)';

/** チーム画面.能力のレーダー,リーグ内の比較,成長の推移. */
export function renderTeam(c: Career): string {
  const u = userTeam(c);
  const mine = teamAttrs(u);
  const others = c.teams.filter((t) => !t.user);
  const lg = Object.fromEntries(ALL_KEYS.map((k) => [k, others.reduce((s, t) => s + teamAttrs(t)[k], 0) / others.length])) as Record<AttrKey, number>;

  const radar: Series[] = [
    { name: esc(u.name), color: MINE, values: ALL_KEYS.map((k) => mine[k]) },
    { name: 'リーグ平均', color: LEAGUE, dash: '5 4', values: ALL_KEYS.map((k) => lg[k]) },
  ];
  const diff = (k: AttrKey) => {
    const d = Math.round(mine[k] - lg[k]);
    return `<span class="${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : ''}${d}</span>`;
  };
  const rows = ALL_KEYS.map((k) => `<tr><td>${LABEL[k]}<span class="tag">${BAT_KEYS.includes(k as never) ? '野手' : '投手'}</span></td><td>${gradeHTML(mine[k])}</td><td class="num">${Math.round(lg[k])}</td><td class="num">${diff(k)}</td></tr>`).join('');

  const table = c.teams
    .map((t) => ({ t, v: ovr(t) }))
    .sort((a, b) => b.v - a.v);
  const max = Math.max(...table.map((x) => x.v));
  const bars = table.map((x) => `<div class="chem"><span class="who ${x.t.user ? 'me' : ''}">${esc(x.t.name)}</span><span class="bar"><i style="width:${(x.v / max) * 100}%;${x.t.user ? '' : 'background:var(--muted)'}"></i></span><span class="num">${Math.round(x.v)}</span></div>`).join('');

  let h = `<h2>チーム能力</h2><div class="card">
  <p class="small muted">打撃・守備は先発9人,投手は上位5人の平均です.${LEAGUES[c.level].name}の他チームと比べています.</p>
  <div class="charts">${radarSVG(ALL_KEYS.map((k) => LABEL[k]), radar)}<div>${legendHTML(radar)}
  <table class="std mini"><thead><tr><th>能力</th><th>自チーム</th><th>リーグ平均</th><th>差</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>
  <h2>リーグ内の総合力</h2><div class="card">${bars}</div>`;

  const hist = c.hist;
  h += `<h2>成長の推移</h2><div class="card">`;
  if (hist.length < 2) {
    h += `<p class="small muted">試合を重ねるとここに推移が表示されます.</p>`;
  } else {
    const marks = hist.map((p, i) => ({ p, i })).filter(({ p, i }) => i > 0 && p.level !== hist[i - 1].level)
      .map(({ p, i }) => ({ x: i, text: LEAGUES[p.level].name.replace('リーグ', '') }));
    const total: Series[] = [{ name: '総合力', color: MINE, values: hist.map((p) => p.ovr) }];
    const bat: Series[] = [
      { name: '野手の平均', color: MINE, values: hist.map((p) => BAT_KEYS.reduce((s, k) => s + p.attrs[k], 0) / BAT_KEYS.length) },
      { name: '投手の平均', color: LEAGUE, dash: '5 4', values: hist.map((p) => PIT_KEYS.reduce((s, k) => s + p.attrs[k], 0) / PIT_KEYS.length) },
    ];
    h += `<h3 style="margin-top:0">総合力</h3>${lineSVG(total, { marks })}
    <h3>野手と投手</h3>${legendHTML(bat)}${lineSVG(bat, { marks })}
    <p class="small muted">縦の点線は昇格・降格です.</p>`;
  }
  return h + `</div>`;
}

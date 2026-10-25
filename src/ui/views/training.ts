import { ALL_KEYS, LABEL, LEAGUES } from '../../data/constants';
import { adviseTraining, leagueAvgAttrs } from '../../growth/advisor';
import { focusKeys, MENUS, type MenuKey } from '../../growth/training';
import { userTeam } from '../../league/season';
import type { Career } from '../../types';
import { gapBarsHTML, miniBarsHTML } from '../charts';
import { state } from '../state';

/** 練習メニューの選択.おすすめと,チームの弱点,見込みのグラフを添える. */
export function renderTraining(c: Career): string {
  const lg = c.leagues[c.level];
  const left = lg.schedule.length - c.week;
  const adv = adviseTraining(userTeam(c), leagueAvgAttrs(c), left, 10 / lg.schedule.length);
  if (!state.menuTouched) state.menu = adv.best;
  const horizon = Math.max(1, Math.min(left, 10));
  const maxGain = Math.max(0.5, ...Object.values(adv.menus).flatMap((m) => ALL_KEYS.map((k) => m.gains[k])));
  const maxTotal = Math.max(...Object.values(adv.menus).map((m) => m.total));
  const best = MENUS[adv.best];

  const cards = (Object.keys(MENUS) as MenuKey[]).map((k) => {
    const m = MENUS[k], a = adv.menus[k];
    return `<button class="menu" data-a="menu" data-k="${k}" aria-pressed="${state.menu === k}">
      <b>${m.name}${k === adv.best ? ' <span class="rec star">★おすすめ</span>' : ''}</b>
      ${focusKeys(m).length ? `<span><span class="focus">重点</span>${focusKeys(m).map((x) => LABEL[x]).join('・')}</span>` : ''}
      <span>${m.desc}</span>
      ${miniBarsHTML(ALL_KEYS.map((x) => ({ label: LABEL[x], value: a.gains[x] })), maxGain)}
      <span class="bar total"><i style="width:${(a.total / maxTotal) * 100}%"></i></span>
      <span>${horizon}試合で全能力の合計 +${a.total.toFixed(1)}(1人あたり)</span></button>`;
  }).join('');

  return `<h2>今週の練習メニュー</h2>
  <div class="card advice"><p style="margin:0"><span class="rec star">★おすすめ</span> <b>${best.name}</b></p>
  <p class="small" style="margin:4px 0 8px">${adv.reason}</p>
  <button class="btn ghost" data-a="menu" data-k="${adv.best}">${best.name}にする</button></div>
  <h3>チームの弱点(${LEAGUES[c.level].name}の他チームとの差)</h3>
  ${gapBarsHTML(ALL_KEYS.map((k) => ({ label: LABEL[k], value: adv.gap[k] })))}
  <h3>練習ごとの伸びの見込み</h3>
  <p class="small muted">棒は能力ごとの伸び(左から ${ALL_KEYS.map((k) => LABEL[k].slice(0, 1)).join('・')}).選んだ能力が重点的に伸び,それ以外も少しずつ伸びます.上限に近い選手ほど伸びにくくなります.</p>
  <div class="menus" role="group" aria-label="練習メニュー">${cards}</div>`;
}

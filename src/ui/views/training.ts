import { ALL_KEYS, LABEL, LEAGUES } from '../../data/constants';
import { adviseTraining, leagueAvgAttrs } from '../../growth/advisor';
import { focusKeys, MENUS, type MenuKey } from '../../growth/training';
import { TRAIN_PER_WEEK, WEEKS_PER_YEAR, weekInfo } from '../../league/calendar';
import { trustGrowth } from '../../league/finance';
import { userTeam } from '../../league/season';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { fold } from '../components';
import { gapBarsHTML, miniBarsHTML } from '../charts';
import { state } from '../state';

/** 練習メニューの選択.おすすめと,見込みのグラフを添える. */
export function renderTraining(c: Career): string {
  const left = WEEKS_PER_YEAR - c.cal;
  const adv = adviseTraining(userTeam(c), leagueAvgAttrs(c), left, TRAIN_PER_WEEK * trustGrowth(c.trust) * weekInfo(c).trainMult, c.meal);
  if (!state.menuTouched) state.menu = adv.best;
  const horizon = Math.max(1, Math.min(left, 8));
  const maxGain = Math.max(0.5, ...Object.values(adv.menus).flatMap((m) => ALL_KEYS.map((k) => m.gains[k])));
  const best = MENUS[adv.best];

  const cards = (Object.keys(MENUS) as MenuKey[]).map((k) => {
    const m = MENUS[k], a = adv.menus[k];
    return `<button class="menu" data-a="menu" data-k="${k}" aria-pressed="${state.menu === k}" title="${esc(m.desc)}">
      <b>${m.name}${k === adv.best ? ' <span class="rec star">★</span>' : ''}</b>
      ${focusKeys(m).length ? `<span><span class="focus">重点</span>${focusKeys(m).map((x) => LABEL[x]).join('・')}</span>` : '<span>&nbsp;</span>'}
      ${miniBarsHTML(ALL_KEYS.map((x) => ({ label: LABEL[x], value: a.gains[x] })), maxGain)}
      <span>${horizon}週で平均 <b>+${(a.total / ALL_KEYS.length).toFixed(1)}</b></span></button>`;
  }).join('');

  const weakest = ALL_KEYS.reduce((a, b) => (adv.gap[b] < adv.gap[a] ? b : a));
  const gap = fold('gap', 'チームの弱点', `いちばん低いのは${LABEL[weakest]}(${adv.gap[weakest] >= 0 ? '+' : ''}${Math.round(adv.gap[weakest])})`,
    `<p class="small muted" style="margin:0 0 4px">${LEAGUES[c.level].name}の他チームの平均との差です.</p>${gapBarsHTML(ALL_KEYS.map((k) => ({ label: LABEL[k], value: adv.gap[k] })))}`);

  return `<h2>今週の練習</h2>
  <div class="card advice"><p style="margin:0"><span class="rec star">★おすすめ</span> <b>${best.name}</b> <span class="small muted">${esc(adv.reason)}</span></p>
  ${state.menu === adv.best ? '' : `<button class="btn ghost" data-a="menu" data-k="${adv.best}" style="margin-top:6px">${best.name}にする</button>`}</div>
  <div class="menus" role="group" aria-label="練習メニュー">${cards}</div>
  <p class="small muted" style="margin:6px 0 0">棒は左から ${ALL_KEYS.map((k) => LABEL[k].slice(0, 1)).join('・')} の伸び.選んだ能力が重点的に伸び,ほかも少しずつ伸びます.</p>
  ${gap}`;
}

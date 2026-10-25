import { ALL_KEYS, LABEL, LEAGUES } from '../../data/constants';
import { adviseTraining, leagueAvgAttrs } from '../../growth/advisor';
import { focusKeys, MENUS, type MenuKey } from '../../growth/training';
import { TRAIN_PER_WEEK, WEEKS_PER_YEAR, weekInfo } from '../../league/calendar';
import { trustGrowth } from '../../league/finance';
import { userTeam } from '../../league/season';
import { chooseMenu } from '../../league/autoplay';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { fold } from '../components';
import { gapBarsHTML, miniBarsHTML } from '../charts';
import { state } from '../state';

const MODES: ['recommend' | 'fixed' | 'manual', string, string][] = [
  ['recommend', 'おまかせ', '毎週,おすすめの練習を自動で選びます'],
  ['fixed', '固定', '選んだ練習を,毎週続けます'],
  ['manual', '手動', '毎週,自分で選びます'],
];

/** 練習メニュー.おすすめと,決め方の設定,見込みを短く見せる. */
export function renderTraining(c: Career): string {
  const left = WEEKS_PER_YEAR - c.cal;
  const adv = adviseTraining(userTeam(c), leagueAvgAttrs(c), left, TRAIN_PER_WEEK * trustGrowth(c.trust) * weekInfo(c).trainMult, c.meal);
  // 今週の練習(自分で選んでいればそれ,そうでなければ決め方の設定に従う)
  state.menu = chooseMenu(c, state.menuTouched ? state.menu : null, state.menu);
  const horizon = Math.max(1, Math.min(left, 8));
  const maxGain = Math.max(0.5, ...Object.values(adv.menus).flatMap((m) => ALL_KEYS.map((k) => m.gains[k])));
  const sel = MENUS[state.menu], selAdv = adv.menus[state.menu];

  const chips = (Object.keys(MENUS) as MenuKey[]).map((k) => {
    const a = adv.menus[k];
    return `<button class="mchip" data-a="menu" data-k="${k}" aria-pressed="${state.menu === k}"><b>${MENUS[k].name}${k === adv.best ? '<span class="rec star">★</span>' : ''}</b><span class="small">+${(a.total / ALL_KEYS.length).toFixed(1)}</span></button>`;
  }).join('');

  const weakest = ALL_KEYS.reduce((a, b) => (adv.gap[b] < adv.gap[a] ? b : a));
  const gap = fold('gap', 'チームの弱点', `いちばん低いのは${LABEL[weakest]}(${adv.gap[weakest] >= 0 ? '+' : ''}${Math.round(adv.gap[weakest])})`,
    `<p class="small muted" style="margin:0 0 4px">${LEAGUES[c.level].name}の他チームの平均との差です.</p>${gapBarsHTML(ALL_KEYS.map((k) => ({ label: LABEL[k], value: adv.gap[k] })))}`);

  return `<h2>今週の練習</h2>
  <div class="seg" role="group" aria-label="練習の決め方">${MODES.map(([k, n]) => `<button class="btn ghost" data-a="train-mode" data-k="${k}" aria-pressed="${c.auto.train === k}">${n}</button>`).join('')}</div>
  <p class="small muted" style="margin:4px 0 8px">${MODES.find((m) => m[0] === c.auto.train)![2]}.メニューをタップすると,今週だけ変えられます${c.auto.train === 'fixed' ? '(「固定」では,選んだものが続きます)' : ''}.</p>
  <div class="mchips" role="group" aria-label="練習メニュー">${chips}</div>
  <div class="card advice" style="margin-top:8px"><p style="margin:0"><b>${sel.name}</b>${state.menu === adv.best ? ' <span class="rec star">★おすすめ</span>' : ''} <span class="small muted">${esc(sel.desc)}</span></p>
  ${miniBarsHTML(ALL_KEYS.map((x) => ({ label: LABEL[x], value: selAdv.gains[x] })), maxGain)}
  <p class="small" style="margin:0">${horizon}週で全能力が平均 <b>+${(selAdv.total / ALL_KEYS.length).toFixed(1)}</b>${focusKeys(sel).length ? ` / 重点: ${focusKeys(sel).map((x) => LABEL[x]).join('・')}` : ''}</p>
  ${state.menu === adv.best ? `<p class="small muted" style="margin:4px 0 0">${esc(adv.reason)}</p>` : `<p class="small muted" style="margin:4px 0 0">おすすめは「${MENUS[adv.best].name}」: ${esc(adv.reason)}</p>`}
  ${c.meal ? `<p class="small" style="margin:4px 0 0"><span class="rec star">料理の効果込み</span> 「${esc(c.meal.name)}」(あと${c.meal.weeks}週)</p>` : ''}</div>
  ${gap}`;
}

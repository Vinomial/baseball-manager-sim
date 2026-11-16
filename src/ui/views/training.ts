import { ALL_KEYS, LABEL, LEAGUES } from '../../data/constants';
import { adviseTraining, leagueAvgAttrs } from '../../growth/advisor';
import { focusKeys, MENUS, type MenuKey } from '../../growth/training';
import { ACTION_SLOTS, ACTIONS, currentPlan, specialTarget, type ActionKey } from '../../league/actions';
import { TRAIN_PER_WEEK, WEEKS_PER_YEAR, weekInfo } from '../../league/calendar';
import { trustGrowth } from '../../league/finance';
import { userTeam } from '../../league/season';
import { chooseMenu } from '../../league/autoplay';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { fold } from '../components';
import { gapBarsHTML, miniBarsHTML } from '../charts';
import { state } from '../state';

/** 今月の方針.月のはじめに練習と行動を決める.決めたあとは,その月の内容と結果を見せる. */
export function renderTraining(c: Career): string {
  const left = WEEKS_PER_YEAR - c.cal;
  const adv = adviseTraining(userTeam(c), leagueAvgAttrs(c), left, TRAIN_PER_WEEK * trustGrowth(c.trust) * weekInfo(c).trainMult);
  const plan = currentPlan(c);
  const month = Math.floor(c.cal / 4) + 1;
  const weakest = ALL_KEYS.reduce((a, b) => (adv.gap[b] < adv.gap[a] ? b : a));
  const gap = fold('gap', 'チームの弱点', `いちばん低いのは${LABEL[weakest]}(${adv.gap[weakest] >= 0 ? '+' : ''}${Math.round(adv.gap[weakest])})`,
    `<p class="small muted" style="margin:0 0 4px">${LEAGUES[c.level].name}の他チームの平均との差です.</p>${gapBarsHTML(ALL_KEYS.map((k) => ({ label: LABEL[k], value: adv.gap[k] })))}`);

  // 決めたあと: 今月の内容
  if (plan) {
    const week = chooseMenu(c, state.menuTouched ? state.menu : null, state.menu);
    state.menu = week;
    return `<h2>${month}月の方針</h2>
    <div class="card plan-done"><p style="margin:0"><b>練習: ${plan.menu ? MENUS[plan.menu as MenuKey].name : `おまかせ(今週は${MENUS[week].name})`}</b>${state.menuTouched ? ` <span class="small">今週だけ「${MENUS[week].name}」</span>` : ''}</p>
    ${plan.actions.length ? `<ul class="recap" style="margin:6px 0 0">${plan.results.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:4px 0 0">今月は行動をしませんでした.</p>'}
    <p class="small muted" style="margin:6px 0 0">次の方針は,${month === 12 ? '来年の 1 月' : `${month + 1}月`}のはじめに決めます.</p></div>${gap}`;
  }

  // 決める前: 練習と行動を選ぶ.決めずに進むと,今週はおすすめの練習になる
  state.menu = chooseMenu(c, state.menuTouched ? state.menu : null, state.menu);
  const d = state.planDraft;
  const menuSel = d.menu;
  const chips = [`<button class="mchip" data-a="pmenu" data-k="" aria-pressed="${menuSel === null}"><b>おまかせ</b><span class="small">毎週おすすめ</span></button>`,
    ...(Object.keys(MENUS) as MenuKey[]).map((k) => {
      const a = adv.menus[k];
      return `<button class="mchip" data-a="pmenu" data-k="${k}" aria-pressed="${menuSel === k}"><b>${MENUS[k].name}${k === adv.best ? '<span class="rec star">★</span>' : ''}</b><span class="small">+${(a.total / ALL_KEYS.length).toFixed(1)}</span></button>`;
    })].join('');
  const shown = menuSel ?? adv.best, selAdv = adv.menus[shown];
  const maxGain = Math.max(0.5, ...Object.values(adv.menus).flatMap((m) => ALL_KEYS.map((k) => m.gains[k])));
  const horizon = Math.max(1, Math.min(left, 8));
  const acts = ACTIONS.map((a) => {
    const on = d.actions.includes(a.key), why = a.can(c), full = !on && d.actions.length >= ACTION_SLOTS;
    return `<button class="act ${on ? 'on' : ''}" data-a="pact" data-k="${a.key}" aria-pressed="${on}" ${why || full ? 'disabled' : ''}>
      <b>${a.name}</b> <span class="small muted">${esc(a.cost(c))}</span><span class="small">${esc(why ?? a.desc)}</span></button>`;
  }).join('');
  const sp = specialTarget(c);
  const target = d.actions.includes('special' as ActionKey)
    ? `<label class="small">特訓する選手 <select data-c="ptarget">${userTeam(c).players.map((p) => `<option value="${p.id}" ${(d.target ?? sp?.id) === p.id ? 'selected' : ''}>${esc(p.name)}(${p.role === '投手' ? '投' : p.pos} ${p.age}歳)${p === sp ? ' ★' : ''}</option>`).join('')}</select></label>` : '';
  return `<h2>${month}月の方針を決める</h2>
  <p class="small muted" style="margin:0 0 6px">月のはじめに,練習と GM の行動(${ACTION_SLOTS}つまで)を決めます.行動はすぐに効きます.決めずに進むと,練習はおまかせになり,行動はできません.</p>
  <h3>練習</h3>
  <div class="mchips" role="group" aria-label="今月の練習">${chips}</div>
  <div class="card advice" style="margin-top:8px"><p style="margin:0"><b>${MENUS[shown].name}</b>${shown === adv.best ? ' <span class="rec star">★おすすめ</span>' : ''} <span class="small muted">${esc(MENUS[shown].desc)}</span></p>
  ${miniBarsHTML(ALL_KEYS.map((x) => ({ label: LABEL[x], value: selAdv.gains[x] })), maxGain)}
  <p class="small" style="margin:0">${horizon}週で全能力が平均 <b>+${(selAdv.total / ALL_KEYS.length).toFixed(1)}</b>${focusKeys(MENUS[shown]).length ? ` / 重点: ${focusKeys(MENUS[shown]).map((x) => LABEL[x]).join('・')}` : ''}</p>
  <p class="small muted" style="margin:4px 0 0">${shown === adv.best ? esc(adv.reason) : `おすすめは「${MENUS[adv.best].name}」: ${esc(adv.reason)}`}</p></div>
  <h3>行動 <span class="small muted">${d.actions.length}/${ACTION_SLOTS}</span></h3>
  <div class="acts">${acts}</div>${target}
  <div class="row" style="margin-top:8px"><button class="btn" data-a="plan-ok">${month}月はこれで決める</button>${c.plan && c.plan.actions.length ? '<button class="btn ghost" data-a="plan-same">先月と同じにする</button>' : ''}</div>
  ${gap}`;
}

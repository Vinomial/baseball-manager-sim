import { fmtYen, budgetFor } from '../../league/finance';
import { projectedPayroll } from '../../league/contracts';
import { staffCost } from '../../league/staff';
import { weeklyIncome } from '../../league/economy';
import { userRosterMax, userTeam } from '../../league/season';
import type { Career } from '../../types';
import { term } from '../glossary';
import { fold } from '../components';
import { facilitiesHTML, facilitiesSummary } from './facilities';
import { kitchenHTML, kitchenSummary, missionsHTML } from './kitchen';
import { scoutHTML, scoutSummary } from './scout';
import { renderStaff } from './staff';
import { forecastHTML, forecastSummary, trustHTML, trustSummary } from './status';
import { goalsHTML } from './todo';

/** GM画面.お金,スタッフ,施設,スカウト,目標など,チームの運営をまとめる. */
export function renderGm(c: Career): string {
  const u = userTeam(c);
  const pay = projectedPayroll(c), bud = budgetFor(c);
  const sumPantry = Object.values(c.pantry).reduce((a, b) => a + b, 0);
  let h = `<div class="card gmhead"><p style="margin:0"><b>GM(ゼネラルマネージャー)</b> <span class="small muted">チームの運営をここで行います</span></p>
  <div class="tiles" style="margin-top:8px">
    <div class="tile"><small>${term('fund')}</small><b>${fmtYen(c.funds)}</b><small>週 +${fmtYen(weeklyIncome(c))}</small></div>
    <div class="tile"><small>${term('salary')}総額</small><b>${fmtYen(pay)}</b><small>${term('budget')} ${fmtYen(bud)}</small></div>
    <div class="tile"><small>スタッフ費</small><b>${fmtYen(staffCost(c))}</b><small>年</small></div>
    <div class="tile"><small>登録</small><b>${u.players.length}/${userRosterMax(c)}</b><small>人</small></div>
  </div></div>`;
  h += fold('goals', 'オーナーの目標', `${c.goals.length}件`, goalsHTML(c), true);
  h += fold('staffs', 'スタッフ(監督・コーチ)', `${Object.values(c.staff).filter(Boolean).length}/6人`, renderStaff(c));
  h += fold('facilities', '施設と資金', facilitiesSummary(c), facilitiesHTML(c));
  h += fold('scout', 'スカウト', scoutSummary(c), scoutHTML(c));
  h += fold('missions', 'ミッション', `${c.missions.length}件 進行中`, missionsHTML(c));
  h += fold('kitchen', '台所', kitchenSummary(c) + (sumPantry && !c.meal ? ' / 料理が作れます' : ''), kitchenHTML(c));
  h += fold('trust', term('trust'), trustSummary(c), trustHTML(c));
  h += fold('forecast', 'シーズンの予想', forecastSummary(c), forecastHTML(c));
  return h;
}

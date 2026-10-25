import type { Career } from '../../types';
import { state, type TeamSub } from '../state';
import { renderOrder } from './order';
import { renderPlayers } from './players';
import { renderStaff } from './staff';
import { renderTeam } from './team';

const SUBS: [TeamSub, string][] = [['power', '能力'], ['players', '選手'], ['order', 'オーダー'], ['staff', 'スタッフ']];

/** チームタブ.能力のグラフ,選手の一覧,オーダーをまとめて切り替える. */
export function renderTeamTab(c: Career): string {
  const tabs = `<div class="lgtabs" role="group" aria-label="チームの表示">${SUBS.map(([k, n]) => `<button data-a="sub" data-k="${k}" aria-pressed="${state.sub === k}">${n}</button>`).join('')}</div>`;
  const body = state.sub === 'power' ? renderTeam(c) : state.sub === 'players' ? renderPlayers(c) : state.sub === 'staff' ? renderStaff(c) : renderOrder(c);
  return tabs + body;
}

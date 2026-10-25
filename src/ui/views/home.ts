import { LABEL, LEAGUES, POS_NAME, ROSTER_MAX } from '../../data/constants';
import { focusKeys, MENUS, type MenuKey } from '../../growth/training';
import { canStartSeason, userMatch, userTeam } from '../../league/season';
import { fielders, ovr, pitchersOf } from '../../league/team';
import type { Career } from '../../types';
import { esc, grade } from '../../util/format';
import { gradeHTML } from '../components';
import { state } from '../state';

export function renderHome(c: Career): string {
  if (c.phase === 'off') return renderOff(c);
  const u = userTeam(c);
  const { home, opp } = userMatch(c);
  let h = '';
  if (c.last) h += `<div class="notice">${esc(c.last)}</div>`;
  const total = c.schedule.length, lg = LEAGUES[c.level];
  h += `<h2>第${c.week + 1}戦の相手 <span class="small muted">(全${total}戦 / ${lg.teams}チーム)</span></h2>
  <div class="card"><div class="row" style="justify-content:space-between">
    <div><b>${esc(opp.name)}</b> <span class="muted small">(${home ? 'ホーム' : 'ビジター'})</span></div>
    <div class="small">相手の総合力 ${gradeHTML(ovr(opp))} 自チーム ${gradeHTML(ovr(u))}</div></div></div>
  <h2>今週の練習メニュー</h2><p class="small muted">選んだ練習の能力が重点的に伸び,それ以外の能力も少しずつ伸びます.試合は自動で進みます.</p>
  <div class="menus" role="group" aria-label="練習メニュー">
  ${(Object.entries(MENUS) as [MenuKey, (typeof MENUS)[MenuKey]][]).map(([k, m]) =>
    `<button class="menu" data-a="menu" data-k="${k}" aria-pressed="${state.menu === k}"><b>${m.name}</b>${focusKeys(m).length ? `<span><span class="focus">重点</span>${focusKeys(m).map((x) => LABEL[x]).join('・')}</span>` : ''}<span>${m.desc}</span></button>`).join('')}
  </div>
  <div class="row" style="margin-top:14px"><button class="btn" data-a="start">${MENUS[state.menu].name}をして試合へ</button>
  <button class="btn ghost" data-a="auto-season">この練習でシーズン終了まで進める</button></div>`;
  if (c.results.length) {
    h += `<h2>今シーズンの試合結果</h2><div class="card scroll"><table class="results"><tbody>${[...c.results].reverse().slice(0, 8).map((r) => {
      const k = r.us > r.them ? 'w' : r.us < r.them ? 'l' : '';
      return `<tr><td>第${r.week + 1}戦</td><td>${esc(r.opp)}<span class="tag">${r.home ? 'H' : 'A'}</span></td><td class="${k}">${r.us > r.them ? '勝' : r.us < r.them ? '負' : '分'}</td><td class="num">${r.us} - ${r.them}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  h += `<h2>データ</h2><div class="row"><button class="btn danger" data-a="reset">データを消して最初から</button></div>`;
  return h;
}

function renderOff(c: Career): string {
  const o = c.off!, u = userTeam(c);
  const mv = o.move > 0 ? `${LEAGUES[o.from + 1].name}へ昇格!` : o.move < 0 ? `${LEAGUES[o.from - 1].name}へ降格...` : `${LEAGUES[o.from].name}に残留.`;
  let h = `<h2>シーズン${c.season} 終了</h2>
  <div class="card"><div class="result px">${o.rank}位 ${o.rec.w}勝${o.rec.l}敗${o.rec.d}分</div><p style="text-align:center;margin:0"><b>${mv}</b></p>
  ${o.retired.length ? `<p class="small">引退: ${o.retired.map(esc).join(',')}</p>` : '<p class="small muted">今オフの引退選手はいません.</p>'}
  <p class="small muted">全選手が1歳年をとりました.ピークを過ぎた選手は能力が少し落ちています.</p></div>`;

  if (!o.drafted) {
    h += `<h2>ドラフト</h2><p class="small muted">スカウトの報告です.能力は幅でしか分かりません.1人指名できます.</p><div class="plist">
    ${o.draft.map((p, i) => `<div class="pl"><div class="top"><span class="nm">${esc(p.name)}<span class="tag">${POS_NAME[p.pos]}</span><span class="tag">${p.age}歳</span></span>
    <button class="btn" data-a="draft" data-i="${i}">指名する</button></div>
    <div class="attrs">${Object.entries(p.scout ?? {}).map(([k, [a, b]]) =>
      `<label>${LABEL[k as keyof typeof LABEL]}</label><span class="g g${grade(a)}">${grade(a)}</span>〜<span class="g g${grade(b)}">${grade(b)}</span><span class="gv"></span>`).join('')}</div></div>`).join('')}
    </div><div class="row" style="margin-top:8px"><button class="btn ghost" data-a="draft" data-i="-1">今年は指名しない</button></div>`;
  } else {
    h += `<div class="notice">${o.drafted === '-' ? '今年は指名を見送りました.' : esc(o.drafted) + ' が入団しました.'}</div>`;
  }
  const n = u.players.length;
  h += `<h2>新シーズンの準備</h2><div class="card"><p class="small">登録人数 ${n}/${ROSTER_MAX}(野手${fielders(u).length},投手${pitchersOf(u).length}).選手を放出するときは「選手」タブから行えます.</p>
  ${n > ROSTER_MAX ? `<p class="small" style="color:var(--bad)">登録上限を超えています.${n - ROSTER_MAX}人放出してください.</p>` : ''}
  <button class="btn" data-a="season" ${canStartSeason(c) ? '' : 'disabled'}>シーズン${c.season + 1}を始める</button></div>`;
  return h;
}

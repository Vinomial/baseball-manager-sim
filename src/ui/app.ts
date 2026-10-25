/** 画面の描画と操作の受け付け. */
import { LEAGUES } from '../data/constants';
import type { MenuKey } from '../growth/training';
import { cook } from '../growth/meals';
import { resolveEvent } from '../league/events';
import { standings } from '../league/schedule';
import {
  newCareer, newSeason, pickDraft, playWeek, releasePlayer, signFreeAgent, userTeam,
} from '../league/season';
import { autoLineup, autoPitchers, getPlayer, setPosition, substitute, swapLineup, swapPitchers } from '../league/team';
import { clearSave, loadCareer, saveCareer } from '../save';
import type { Career, LineupPos } from '../types';
import { esc } from '../util/format';
import { state, writeAutoOpen, type Tab } from './state';
import { renderGame } from './views/game';
import { renderHome } from './views/home';
import { renderOrder } from './views/order';
import { renderPlayers } from './views/players';
import { initReplay } from './replay';
import { renderStart } from './views/start';
import { renderRecords } from './views/records';
import { renderTable } from './views/table';
import { renderTeam } from './views/team';

let root: HTMLElement;

function renderFired(c: Career): string {
  const r = c.rec;
  return `<div class="start"><header class="board px"><div class="board-top"><span class="title">ダイヤモンド監督</span><span class="lg">解任</span></div><div class="team">${esc(userTeam(c).name)}</div></header>
  <div class="card gameover"><p class="result px" style="color:var(--bad)">解任されました</p><p>${esc(c.fired!.text)}</p>
  <p class="small muted">通算 ${r.total.w}勝${r.total.l}敗${r.total.d}分 / 優勝 ${r.titles.reduce((a, b) => a + b, 0)}回 / 実績 ${Object.keys(c.ach).length}個</p>
  <button class="btn danger" data-a="reset">最初からやり直す</button></div></div>`;
}

const TABS: [Tab, string][] = [['home', 'ホーム'], ['game', '結果'], ['team', 'チーム'], ['players', '選手'], ['order', 'オーダー'], ['table', '順位'], ['rec', '記録']];

function render(): void {
  const c = state.career;
  if (!c) { root.innerHTML = renderStart(); return; }
  if (c.fired) { root.innerHTML = renderFired(c); return; }
  const rank = standings(c).findIndex((r) => r.t.id === c.userId) + 1;
  const rec = c.phase === 'season' ? c.leagues[c.level].stand[c.userId] : c.off!.rec;
  const weekLabel = c.phase === 'season' ? `${c.week + 1}/${c.leagues[c.level].schedule.length}` : 'オフ';
  const body = {
    home: () => renderHome(c),
    game: () => renderGame(c),
    team: () => renderTeam(c),
    players: () => renderPlayers(c),
    order: () => renderOrder(c),
    table: () => renderTable(c),
    rec: () => renderRecords(c),
  }[state.tab]();
  root.innerHTML = `
  <header class="board px">
    <div class="board-top"><span class="title">ダイヤモンド監督</span><span class="lg">${LEAGUES[c.level].name}</span></div>
    <div class="team">${esc(userTeam(c).name)}</div>
    <div class="cells">
      <div class="cell"><b>${c.season}</b><small>シーズン</small></div>
      <div class="cell"><b>${weekLabel}</b><small>試合</small></div>
      <div class="cell"><b>${rec.w}-${rec.l}-${rec.d}</b><small>勝-敗-分</small></div>
      <div class="cell"><b>${c.phase === 'season' ? rank : c.off?.rank}</b><small>位</small></div>
    </div>
  </header>
  <nav class="tabs" aria-label="画面切り替え">${TABS.map(([k, n]) =>
    `<button data-a="tab" data-k="${k}" aria-current="${state.tab === k}">${n}</button>`).join('')}</nav>
  <main>${body}</main>`;
  initReplay(root, state.tab === 'game' ? state.last?.game ?? null : null);
}

const save = () => { if (state.career) saveCareer(state.career); };
const top = () => window.scrollTo(0, 0);

function onClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
  if (!el || (el as HTMLButtonElement).disabled || el.tagName === 'SELECT') return;
  const a = el.dataset.a, k = el.dataset.k ?? '', i = Number(el.dataset.i), id = Number(el.dataset.id);
  const c = state.career;

  switch (a) {
    case 'new': {
      const v = (document.getElementById('tname') as HTMLInputElement | null)?.value.trim() || 'マイチーム';
      state.career = newCareer(v); state.tab = 'home'; save(); break;
    }
    case 'tab': state.tab = k as Tab; state.sel = null; state.open = null; top(); break;
    case 'menu': state.menu = k as MenuKey; state.menuTouched = true; break;
    case 'start': {
      if (!c || c.phase !== 'season') break;
      state.last = { ...playWeek(c, state.menu), menu: state.menu };
      state.menuTouched = false;
      if (state.autoOpen) { state.tab = 'game'; top(); }
      save(); break;
    }
    case 'auto-season': {
      if (!c || c.phase !== 'season') break;
      while (c.phase === 'season') state.last = { ...playWeek(c, state.menu), menu: state.menu };
      state.menuTouched = false;
      state.tab = 'home'; save(); top(); break;
    }
    case 'reset':
      if (confirm('保存データを消して最初からやり直します.よろしいですか?')) {
        clearSave(); state.career = null; state.last = null;
      }
      break;
    case 'open': state.open = state.open === id ? null : id; break;
    case 'selL': {
      if (!c) break;
      const u = userTeam(c), s = state.sel;
      if (s?.t === 'l') { if (s.i !== i) swapLineup(u, s.i, i); state.sel = null; save(); }
      else if (s?.t === 'b') { substitute(u, i, s.id); state.sel = null; save(); }
      else state.sel = { t: 'l', i };
      break;
    }
    case 'selB': {
      if (!c) break;
      const s = state.sel;
      if (s?.t === 'l') { substitute(userTeam(c), s.i, id); state.sel = null; save(); }
      else state.sel = { t: 'b', id };
      break;
    }
    case 'selP': {
      if (!c) break;
      const s = state.sel;
      if (s?.t === 'p') { if (s.i !== i) swapPitchers(userTeam(c), s.i, i); state.sel = null; save(); }
      else state.sel = { t: 'p', i };
      break;
    }
    case 'auto': if (c) { const u = userTeam(c); autoLineup(u); autoPitchers(u); state.sel = null; save(); } break;
    case 'draft': if (c) { pickDraft(c, i); save(); } break;
    case 'cook': if (c) { const m = cook(c, k); if (m) { c.news = [`${m.name}を食べた!${m.desc}.`]; save(); } } break;
    case 'autoopen': state.autoOpen = !state.autoOpen; writeAutoOpen(state.autoOpen); break;
    case 'event': {
      if (!c) break;
      const text = resolveEvent(c, k);
      if (text) c.news.push(text);
      save();
      break;
    }
    case 'ostep': if (c?.off) { c.off.step = Math.max(0, Math.min(3, c.off.step + Number(k))); save(); top(); } break;
    case 'sign': {
      if (!c) break;
      const err = signFreeAgent(c, id);
      if (err) alert(err); else save();
      break;
    }
    case 'faRole': state.faRole = k as '野手' | '投手'; break;
    case 'lv': state.viewLevel = i; state.viewTeam = null; break;
    case 'vteam': state.viewTeam = id < 0 ? null : id; state.open = null; break;
    case 'release': {
      if (!c) break;
      const p = getPlayer(userTeam(c), id);
      if (!confirm(`${p.name} を放出します.よろしいですか?`)) break;
      const err = releasePlayer(c, id);
      if (err) alert(err); else { state.open = null; save(); }
      break;
    }
    case 'season': if (c) { newSeason(c); state.tab = 'home'; save(); top(); } break;
  }
  render();
}

function onChange(e: Event): void {
  const el = e.target as HTMLSelectElement;
  if (el.dataset.a !== 'pos' || !state.career) return;
  setPosition(userTeam(state.career), Number(el.dataset.i), el.value as LineupPos);
  save();
  render();
}

export function mount(el: HTMLElement): void {
  root = el;
  state.career = loadCareer();
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  render();
}

/** 画面の描画と操作の受け付け. */
import { LEAGUES } from '../data/constants';
import type { MenuKey } from '../growth/training';
import { cook } from '../growth/meals';
import { sellIngredient, upgrade } from '../league/economy';
import { weekInfo } from '../league/calendar';
import { resolveEvent } from '../league/events';
import { standings } from '../league/schedule';
import {
  newCareer, newSeason, pickDraft, playWeek, releasePlayer, signFreeAgent, userTeam,
} from '../league/season';
import { autoLineup, autoPitchers, findPlayer, getPlayer, setPosition, substitute, swapLineup, swapPitchers } from '../league/team';
import { clearSave, loadCareer, migrate, saveCareer } from '../save';
import type { Career, FacKey, Ingredient, LineupPos, Pos } from '../types';
import { cancelConvert, startConvert } from '../league/convert';
import { detailSheet } from './detail';
import { esc } from '../util/format';
import { state, writeAutoOpen, type Screen, type Tab, type TeamSub } from './state';
import { renderGame } from './views/game';
import { renderHome } from './views/home';
import { initReplay } from './replay';
import { renderStart, renderTitle } from './views/start';
import { confirmMessage } from '../league/warnings';
import { userSide } from '../engine/game';
import { resultSound, setBgm, setSe, sfx, sound, unlockAudio } from './sound';
import { renderRecords } from './views/records';
import { renderTable } from './views/table';
import { renderTeamTab } from './views/teamtab';

let root: HTMLElement;

function renderFired(c: Career): string {
  const r = c.rec;
  return `<div class="start"><header class="board px"><div class="board-top"><span class="title">ダイヤモンド監督</span><span class="lg">解任</span></div><div class="team">${esc(userTeam(c).name)}</div></header>
  <div class="card gameover"><p class="result px" style="color:var(--bad)">解任されました</p><p>${esc(c.fired!.text)}</p>
  <p class="small muted">通算 ${r.total.w}勝${r.total.l}敗${r.total.d}分 / 優勝 ${r.titles.reduce((a, b) => a + b, 0)}回 / 実績 ${Object.keys(c.ach).length}個</p>
  <button class="btn danger" data-a="reset">最初からやり直す</button></div></div>`;
}

const TABS: [Tab, string, string][] = [['home', 'ホーム', '⌂'], ['game', '試合', '▶'], ['team', 'チーム', '☺'], ['table', '順位', '≡'], ['rec', '記録', '★']];

/** 右上のメニュー.タイトルへ戻る,セーブ,バックアップなど. */
function menuSheet(c: Career): string {
  return `<div class="sheet-bg" data-a="menu-close"></div><div class="sheet" role="dialog" aria-label="メニュー">
  <div class="sheet-h"><b>メニュー</b><button class="btn ghost" data-a="menu-close" aria-label="閉じる">✕</button></div>
  <button class="btn" data-a="savenow">💾 いまセーブする</button>
  <button class="btn ghost" data-a="screen" data-k="title">⏏ タイトルに戻る</button>
  <button class="btn ghost" data-a="gokitchen">🍙 台所とミッション</button>
  <button class="btn ghost" data-a="export">⬇ バックアップを保存</button>
  <label class="btn ghost filebtn">⬆ バックアップを読み込む<input id="imp" type="file" accept="application/json,.json" hidden></label>
  <button class="btn ghost" data-a="se" aria-pressed="${sound.se}">🔊 効果音: ${sound.se ? 'ON' : 'OFF'}</button>
  <button class="btn ghost" data-a="bgm" aria-pressed="${sound.bgm}">🎵 BGM: ${sound.bgm ? 'ON' : 'OFF'}</button>
  <button class="btn ghost" data-a="autoopen" aria-pressed="${state.autoOpen}">試合後に結果を開く: ${state.autoOpen ? 'ON' : 'OFF(スキップ)'}</button>
  <p class="small muted" style="margin:6px 0 0">進行は自動でセーブされます.第${c.season}シーズン.</p></div>`;
}

/** 疲れがたまっているときの確認 */
function warnSheet(msg: string): string {
  return `<div class="sheet-bg" data-a="warn-cancel"></div><div class="sheet" role="alertdialog" aria-label="休養のおすすめ">
  <div class="sheet-h"><b>⚠ 休養をおすすめします</b></div>
  <p style="margin:0">${esc(msg)}</p>
  <button class="btn" data-a="warn-rest">休養にして進める</button>
  <button class="btn ghost" data-a="warn-go">このまま進める</button>
  <button class="btn ghost" data-a="warn-cancel">もどる</button></div>`;
}

/** 画面の下に,ひとこと出す */
function toast(msg: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  window.setTimeout(() => t.remove(), 1800);
}

function render(): void {
  const c = state.career;
  if (!c) { root.innerHTML = state.screen === 'new' ? renderStart() : renderTitle(null); return; }
  if (state.screen === 'title') { root.innerHTML = renderTitle(c); return; }
  if (state.screen === 'new') { root.innerHTML = renderStart(true); return; }
  if (c.fired) { root.innerHTML = renderFired(c); return; }
  const rank = standings(c).findIndex((r) => r.t.id === c.userId) + 1;
  const rec = c.phase === 'season' ? c.leagues[c.level].stand[c.userId] : c.off!.rec;
  const weekLabel = c.phase === 'season' ? weekInfo(c).label.replace(' 第', '') : 'オフ';
  const body = {
    home: () => renderHome(c),
    game: () => renderGame(c),
    team: () => renderTeamTab(c),
    table: () => renderTable(c),
    rec: () => renderRecords(c),
  }[state.tab]();
  const alert = c.event && state.tab !== 'home' ? ' <i class="dot" aria-label="出来事があります"></i>' : '';
  root.innerHTML = `
  <header class="board slim px">
    <div class="b-row"><span class="title">ダイヤモンド監督</span><span class="lg">${LEAGUES[c.level].name}<button class="menubtn" data-a="menu-open" aria-label="メニュー" aria-expanded="${state.menuOpen}">☰</button></span></div>
    <div class="b-row"><span class="tm">${esc(userTeam(c).name)}</span>
      <span class="stat"><b>${c.season}</b>季 <b>${weekLabel}</b> <b>${rec.w}-${rec.l}-${rec.d}</b> <b>${c.phase === 'season' ? rank : c.off?.rank}</b>位</span></div>
  </header>
  <main>${body}</main>
  <nav class="bottom" aria-label="画面切り替え">${TABS.map(([k, n, ic]) =>
    `<button data-a="tab" data-k="${k}" aria-current="${state.tab === k}"><span class="ic" aria-hidden="true">${ic}</span>${n}${k === 'home' ? alert : ''}</button>`).join('')}</nav>`;
  if (state.menuOpen) root.insertAdjacentHTML('beforeend', menuSheet(c));
  if (state.warn) root.insertAdjacentHTML('beforeend', warnSheet(state.warn));
  if (state.detail !== null) root.insertAdjacentHTML('beforeend', detailSheet(c, state.detail));
  initReplay(root, state.tab === 'game' ? state.last?.game ?? null : null);
}

/** 今週を進める */
function doStart(c: Career): void {
  const r = playWeek(c, state.menu, { practice: state.practice });
  state.last = { games: r.games, game: r.games[r.games.length - 1] ?? null, kind: r.kind, menu: state.menu, report: r.report };
  state.menuTouched = false; state.practice = false;
  if (state.autoOpen && r.games.length) { state.tab = 'game'; top(); }
  const g = r.games[r.games.length - 1];
  if (g && r.kind !== 'practice') { const us = userSide(g), them = us === g.home ? g.away : g.home; resultSound(us.runs === them.runs ? null : us.runs > them.runs); }
  else if (c.news.some((n) => n.includes('実績解除') || n.includes('ミッション達成'))) sfx.ok();
  save();
}

const save = () => { if (state.career) saveCareer(state.career); };
const top = () => window.scrollTo(0, 0);

function onClick(e: MouseEvent): void {
  unlockAudio();
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
  if (!el || (el as HTMLButtonElement).disabled || el.tagName === 'SELECT') return;
  if (!['start', 'warn-go', 'warn-rest', 'se'].includes(el.dataset.a ?? '')) sfx.tap();
  const a = el.dataset.a, k = el.dataset.k ?? '', i = Number(el.dataset.i), id = Number(el.dataset.id);
  const c = state.career;

  switch (a) {
    case 'new': {
      const v = (document.getElementById('tname') as HTMLInputElement | null)?.value.trim() || 'マイチーム';
      state.career = newCareer(v); state.last = null; state.tab = 'home'; state.screen = 'play'; state.menuOpen = false; save(); break;
    }
    case 'screen': {
      state.screen = k as Screen; state.menuOpen = false;
      if (k === 'title') save();
      top(); break;
    }
    case 'detail': state.detail = id; break;
    case 'detail-close': state.detail = null; break;
    case 'convert': if (c) { const err = startConvert(c, id, k as Pos); if (err) alert(err); else save(); } break;
    case 'convert-cancel': if (c) { const p = findPlayer(userTeam(c), id); if (p) { cancelConvert(p); save(); } } break;
    case 'menu-open': state.menuOpen = true; break;
    case 'menu-close': state.menuOpen = false; break;
    case 'savenow': save(); state.menuOpen = false; toast('セーブしました'); break;
    case 'gokitchen':
      state.tab = 'home'; state.menuOpen = false; state.folds.kitchen = true; state.folds.missions = true;
      render();
      document.querySelector('[data-fold="missions"]')?.scrollIntoView({ block: 'start' });
      return;
    case 'sub': state.sub = k as TeamSub; state.sel = null; state.open = null; top(); break;
    case 'export': if (c) exportSave(c); break;
    case 'tab': state.tab = k as Tab; state.sel = null; state.open = null; top(); break;
    case 'menu': state.menu = k as MenuKey; state.menuTouched = true; break;
    case 'start': {
      if (!c || c.phase !== 'season') break;
      const msg = confirmMessage(c, state.menu, state.practice);
      if (msg) { state.warn = msg; sfx.warn(); break; }
      doStart(c);
      break;
    }
    case 'warn-rest': if (c) { state.menu = 'rest'; state.menuTouched = true; state.practice = false; state.warn = null; doStart(c); } break;
    case 'warn-go': if (c) { state.warn = null; doStart(c); } break;
    case 'warn-cancel': state.warn = null; break;
    case 'se': setSe(!sound.se); break;
    case 'bgm': setBgm(!sound.bgm); break;
    case 'practice': state.practice = !state.practice; break;
    case 'game-pick': if (state.last) state.last.game = state.last.games[i] ?? state.last.game; break;
    case 'auto-season': {
      if (!c || c.phase !== 'season') break;
      let r;
      while (c.phase === 'season' && !c.fired) r = playWeek(c, state.menu);
      if (r) state.last = { games: r.games, game: r.games[r.games.length - 1] ?? null, kind: r.kind, menu: state.menu, report: r.report };
      state.menuTouched = false; state.practice = false;
      state.tab = 'home'; save(); top(); break;
    }
    case 'reset':
      if (confirm('保存データを消して最初からやり直します.よろしいですか?')) {
        clearSave(); state.career = null; state.last = null; state.screen = 'new'; state.menuOpen = false;
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
    case 'upgrade': if (c) { const err = upgrade(c, k as FacKey); if (err) alert(err); else save(); } break;
    case 'sell': if (c) { const err = sellIngredient(c, k as Ingredient, i); if (err) alert(err); else save(); } break;
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

/** セーブデータをファイルとして保存する */
function exportSave(c: Career): void {
  const blob = new Blob([JSON.stringify(c)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diamond-kantoku-save-s${c.season}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function onChange(e: Event): void {
  const el = e.target as HTMLSelectElement;
  if ((el as unknown as HTMLInputElement).id === 'imp') {
    const f = (el as unknown as HTMLInputElement).files?.[0];
    if (!f) return;
    void f.text().then((t) => {
      try {
        const c = migrate(JSON.parse(t));
        if (!c) { alert('読み込めないデータです.'); return; }
        if (!confirm('いまのデータを,読み込んだデータで置き換えます.よろしいですか?')) return;
        state.career = c; state.last = null; state.tab = 'home'; state.screen = 'play'; save(); render();
      } catch { alert('読み込めないデータです.'); }
    });
    return;
  }
  if (el.dataset.a !== 'pos' || !state.career) return;
  setPosition(userTeam(state.career), Number(el.dataset.i), el.value as LineupPos);
  save();
  render();
}

export function mount(el: HTMLElement): void {
  root = el;
  state.career = loadCareer();
  state.screen = 'title';
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (state.menuOpen || state.detail !== null)) { state.menuOpen = false; state.detail = null; render(); } });
  // 折りたたみの開閉を覚えておく(再描画しても開いたままにするため)
  document.addEventListener('toggle', (e) => {
    const d = e.target as HTMLElement;
    if (d instanceof HTMLDetailsElement && d.dataset.fold) state.folds[d.dataset.fold] = d.open;
  }, true);
  render();
}

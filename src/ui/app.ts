/** 画面の描画と操作の受け付け. */
import { LEAGUES } from '../data/constants';
import type { MenuKey } from '../growth/training';
import { cook } from '../growth/meals';
import { sellIngredient, upgrade } from '../league/economy';
import { chooseMenu, stopReason } from '../league/autoplay';
import { WEEKS_PER_YEAR, weekInfo } from '../league/calendar';
import { resolveEvent } from '../league/events';
import { standings } from '../league/schedule';
import {
  newCareer, newSeason, pickDraft, playWeek, releasePlayer, signFreeAgent, userTeam,
} from '../league/season';
import { autoLineup, autoPitchers, findPlayer, getPlayer, setPosition, substitute, swapLineup, swapPitchers } from '../league/team';
import { clearSave, loadCareer, migrate, rawSave, saveCareer, SIZE_WARN } from '../save';
import type { Career, Difficulty, FacKey, StaffRole, Ingredient, LineupPos, Pos } from '../types';
import { cancelConvert, startConvert } from '../league/convert';
import { negotiate } from '../league/contracts';
import { fireStaff, hireStaff } from '../league/staff';
import { dispatchScout } from '../league/scouting';
import { detailSheet } from './detail';
import { esc } from '../util/format';
import { state, writeAutoOpen, type Screen, type Tab, type TeamSub } from './state';
import { renderGame } from './views/game';
import { renderHome } from './views/home';
import { initReplay } from './replay';
import { DIFFS } from '../data/constants';
import { renderStart, renderTitle } from './views/start';
import { recap } from '../engine/recap';
import { gameText, seasonText, shareImage, shareText } from './share';
import { confirmMessage } from '../league/warnings';
import { userSide } from '../engine/game';
import { applyPrefs, prefs, savePrefs, type FontSize, type Theme } from './prefs';
import { glossarySheet, termSheet } from './glossary';
import { resultSound, setBgm, setScene, setSe, setVib, setVolume, sfx, sound, unlockAudio } from './sound';
import { renderGm } from './views/gm';
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

/** 画面下のタブ.アイコンは小さなドット絵. */
const TABS: [Tab, string][] = [['home', 'ホーム'], ['team', 'チーム'], ['table', 'リーグ'], ['gm', 'GM'], ['rec', '記録']];

/** タブのドット絵(8×8).1 の所を塗る. */
const ICONS: Record<string, string[]> = {
  home: ['00011000', '00111100', '01111110', '11111111', '11011011', '11011011', '11000011', '11111111'],
  team: ['00111100', '01111110', '01011010', '01111110', '00111100', '01111110', '11111111', '11000011'],
  table: ['11111111', '10000001', '10110101', '10000001', '10101101', '10000001', '10110101', '11111111'],
  gm: ['00111100', '00100100', '11111111', '11111111', '11100111', '11111111', '11111111', '11111111'],
  rec: ['00011000', '00011000', '00111100', '11111111', '01111110', '00111100', '01100110', '01000010'],
};
function iconSVG(k: string): string {
  const rows = ICONS[k] ?? ICONS.home;
  const rects = rows.flatMap((r, y) => [...r].map((v, x) => (v === '1' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('');
  return `<svg class="pxi" viewBox="0 0 8 8" width="22" height="22" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
}

/** 右上のメニュー.タイトルへ戻る,セーブ,バックアップなど. */
function menuSheet(c: Career): string {
  return `<div class="sheet-bg" data-a="menu-close"></div><div class="sheet" role="dialog" aria-label="メニュー">
  <div class="sheet-h"><b>メニュー</b><button class="btn ghost" data-a="menu-close" aria-label="閉じる">✕</button></div>
  <button class="btn" data-a="savenow">💾 いまセーブする</button>
  <button class="btn ghost" data-a="screen" data-k="title">⏏ タイトルに戻る</button>
  <button class="btn ghost" data-a="gokitchen">🍙 台所とミッション</button>
  <button class="btn ghost" data-a="export">⬇ バックアップを保存</button>
  <label class="btn ghost filebtn">⬆ バックアップを読み込む<input id="imp" type="file" accept="application/json,.json" hidden></label>
  <p class="small muted" style="margin:4px 0 0">難易度</p>
  <div class="seg" role="group" aria-label="難易度">${(Object.keys(DIFFS) as Difficulty[]).map((d) => `<button class="btn ghost" data-a="diff" data-k="${d}" aria-pressed="${c.diff === d}">${DIFFS[d].name}</button>`).join('')}</div>
  <p class="small muted" style="margin:0">${DIFFS[c.diff].desc}</p>
  <p class="small muted" style="margin:4px 0 0">おまかせ進行</p>
  <button class="btn ghost" data-a="auto-lineup" aria-pressed="${c.auto.lineup}">毎週オーダーを自動で組み直す: ${c.auto.lineup ? 'ON' : 'OFF'}</button>
  <button class="btn ghost" data-a="auto-rest" aria-pressed="${c.auto.rest}">疲れがたまったら自動で休養: ${c.auto.rest ? 'ON' : 'OFF'}</button>
  <div class="seg" role="group" aria-label="テーマ">${(['auto', 'light', 'dark'] as Theme[]).map((t) => `<button class="btn ghost" data-a="theme" data-k="${t}" aria-pressed="${prefs.theme === t}">${t === 'auto' ? 'テーマ自動' : t === 'light' ? 'ライト' : 'ダーク'}</button>`).join('')}</div>
  <div class="seg" role="group" aria-label="文字サイズ">${(['s', 'm', 'l'] as FontSize[]).map((f) => `<button class="btn ghost" data-a="font" data-k="${f}" aria-pressed="${prefs.font === f}">文字${f === 's' ? '小' : f === 'm' ? '標準' : '大'}</button>`).join('')}</div>
  <button class="btn ghost" data-a="tut-again">📘 はじめてガイドをもう一度</button>
  <button class="btn ghost" data-a="glossary">📖 用語集</button>
  <button class="btn ghost" data-a="se" aria-pressed="${sound.se}">🔊 効果音: ${sound.se ? 'ON' : 'OFF'}</button>
  <label class="vol">効果音の大きさ<input type="range" min="0" max="100" value="${Math.round(sound.vol.se * 100)}" data-vol="se" aria-label="効果音の大きさ"></label>
  <button class="btn ghost" data-a="bgm" aria-pressed="${sound.bgm}">🎵 BGM: ${sound.bgm ? 'ON' : 'OFF'}</button>
  <label class="vol">BGMの大きさ<input type="range" min="0" max="100" value="${Math.round(sound.vol.bgm * 100)}" data-vol="bgm" aria-label="BGMの大きさ"></label>
  ${'vibrate' in navigator ? `<button class="btn ghost" data-a="vib" aria-pressed="${sound.vib}">📳 振動: ${sound.vib ? 'ON' : 'OFF'}</button>` : ''}
  <button class="btn ghost" data-a="autoopen" aria-pressed="${state.autoOpen}">試合後に結果を開く: ${state.autoOpen ? 'ON' : 'OFF(スキップ)'}</button>
  <p class="small muted" style="margin:6px 0 0">進行は自動でセーブされます.第${c.season}シーズン.</p></div>`;
}

/** セーブの問題を知らせる */
function saveBanner(): string {
  if (state.saveFail) return '<div class="warnbox bad">⚠ セーブできませんでした(保存容量がいっぱいです).メニューの「バックアップを保存」で,いまのデータを残してください.</div>';
  if (state.saveSize > SIZE_WARN) return '<div class="warnbox warn">⚠ セーブが大きくなっています.メニューの「バックアップを保存」をおすすめします.</div>';
  return '';
}

/** 長い処理の進み具合 */
function busyOverlay(): string {
  const b = state.busy!;
  return `<div class="sheet-bg"></div><div class="sheet" role="status" aria-live="polite"><div class="sheet-h"><b>⏩ 年末まで進めています…</b></div>
  <div class="chem"><span class="bar"><i id="busybar" style="width:${(b.done / b.total) * 100}%"></i></span><span id="busytxt" class="small">${b.done}/${b.total}週</span></div>
  <button class="btn ghost" data-a="busy-cancel">ここで中止する</button></div>`;
}

/** 想定外のエラーが起きたときの画面.セーブは壊さず,バックアップを取れるようにする. */
function showCrash(err: unknown): void {
  console.error(err);
  if (document.getElementById('crash')) return;
  const msg = err instanceof Error ? err.message : String(err);
  document.body.insertAdjacentHTML('beforeend', `<div class="sheet-bg" id="crash-bg" style="z-index:90"></div><div class="sheet" id="crash" role="alertdialog" style="z-index:91">
  <div class="sheet-h"><b>⚠ エラーが起きました</b></div>
  <p style="margin:0">ご迷惑をおかけします.保存済みのセーブは無事です(エラーのあとの内容は保存していません).</p>
  <p class="small muted" style="margin:0;word-break:break-all">${esc(msg)}</p>
  <button class="btn" id="crash-backup">保存済みのセーブをバックアップする</button>
  <button class="btn ghost" id="crash-reload">ページを読み込み直す</button></div>`);
  document.getElementById('crash-backup')?.addEventListener('click', () => {
    const raw = rawSave();
    if (!raw) { alert('保存されたセーブがありません.'); return; }
    downloadText(raw, `diamond-kantoku-save-backup.json`);
  });
  document.getElementById('crash-reload')?.addEventListener('click', () => location.reload());
}

function downloadText(text: string, name: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
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
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  t.textContent = msg;
  document.body.appendChild(t);
  window.setTimeout(() => t.remove(), 1800);
}

function render(): void {
  try { renderInner(); } catch (e) { showCrash(e); }
}

function renderInner(): void {
  const c = state.career;
  setScene(!c || state.screen !== 'play' ? 'title' : c.phase === 'off' ? 'off' : state.tab === 'game' ? 'game' : 'home');
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
    gm: () => renderGm(c),
    rec: () => renderRecords(c),
  }[state.tab]();
  const alert = c.event && state.tab !== 'home' ? ' <i class="dot" aria-label="出来事があります"></i>' : '';
  root.innerHTML = `
  <a class="skip" href="#main">本文へ移動</a>
  <header class="board slim px" data-lg="${c.level}">
    <div class="b-row"><span class="title">ダイヤモンド監督</span><span class="lg">${LEAGUES[c.level].name}<button class="menubtn" data-a="menu-open" aria-label="メニュー" aria-expanded="${state.menuOpen}">☰</button></span></div>
    <div class="b-row"><span class="tm">${esc(userTeam(c).name)}</span>
      <span class="stat"><b>${c.season}</b>季 <b>${weekLabel}</b> <b>${rec.w}-${rec.l}-${rec.d}</b> <b>${c.phase === 'season' ? rank : c.off?.rank}</b>位</span></div>
  </header>
  ${saveBanner()}<main id="main" tabindex="-1">${body}</main>
  <nav class="bottom" aria-label="画面切り替え">${TABS.map(([k, n]) =>
    `<button data-a="tab" data-k="${k}" aria-current="${state.tab === k || (k === 'home' && state.tab === 'game')}">${iconSVG(k)}<span>${n}</span>${k === 'home' ? alert : ''}</button>`).join('')}</nav>`;
  if (c.phase === 'off' && c.off && c.off.step === 0 && state.celebrated !== c.season && c.off.review && (c.off.review.ownTitle || c.off.review.cupChampion || c.off.move > 0)) { state.celebrated = c.season; sfx.level(); }
  if (state.busy) root.insertAdjacentHTML('beforeend', busyOverlay());
  if (state.menuOpen) root.insertAdjacentHTML('beforeend', menuSheet(c));
  if (state.warn) root.insertAdjacentHTML('beforeend', warnSheet(state.warn));
  if (state.term) root.insertAdjacentHTML('beforeend', state.term === '*' ? glossarySheet() : termSheet(state.term));
  if (state.detail !== null) root.insertAdjacentHTML('beforeend', detailSheet(c, state.detail));
  initReplay(root, state.tab === 'game' ? state.last?.game ?? null : null);
}

/**
 * 週を続けて進める.途中で画面が固まらないよう,ときどき処理を譲って進み具合を出す.
 * @param limit 進める週数の上限
 * @param stops true なら,出来事や警告などで途中で止まる
 */
async function runWeeks(c: Career, limit: number, stops: boolean): Promise<void> {
  const total = Math.max(1, Math.min(limit, WEEKS_PER_YEAR - c.cal));
  state.busy = { done: 0, total, cancel: false, title: limit >= 99 ? '年末まで進めています…' : `${total}週進めています…` };
  render();
  let r: ReturnType<typeof playWeek> | undefined;
  let stopped: string | null = null;
  try {
    while (c.phase === 'season' && !c.fired && !state.busy.cancel && state.busy.done < total) {
      const menu = state.busy.done === 0 && state.menuTouched ? state.menu : chooseMenu(c, null, state.menu);
      r = playWeek(c, menu);
      state.busy.done++;
      const b = document.getElementById('busybar'), t = document.getElementById('busytxt');
      if (b) b.style.width = `${Math.min(100, (state.busy.done / total) * 100)}%`;
      if (t) t.textContent = `${state.busy.done}/${total}週`;
      if (stops && !state.busy.cancel && state.busy.done < total) {
        stopped = stopReason(c, chooseMenu(c, null, menu));
        if (stopped) break;
      }
      if (state.busy.done % 2 === 0) await new Promise((res) => window.setTimeout(res, 0));
    }
  } catch (e) { state.busy = null; showCrash(e); return; }
  if (r) state.last = { games: r.games, game: r.games[r.games.length - 1] ?? null, kind: r.kind, menu: r.menu, report: r.report };
  state.busy = null;
  state.menuTouched = false; state.practice = false;
  state.tab = 'home';
  if (stopped) c.news.unshift(`ここで止まりました: ${stopped}`);
  save();
  top();
  render();
}

/** 今週を進める */
function doStart(c: Career): void {
  const r = playWeek(c, state.menuTouched ? state.menu : chooseMenu(c, null, state.menu), { practice: state.practice });
  state.last = { games: r.games, game: r.games[r.games.length - 1] ?? null, kind: r.kind, menu: r.menu, report: r.report };
  state.menuTouched = false; state.practice = false;
  if (state.autoOpen && r.games.length) { state.tab = 'game'; top(); }
  const g = r.games[r.games.length - 1];
  if (g && r.kind !== 'practice') { const us = userSide(g), them = us === g.home ? g.away : g.home; resultSound(us.runs === them.runs ? null : us.runs > them.runs); }
  else if (c.news.some((n) => n.includes('実績解除') || n.includes('ミッション達成'))) sfx.ok();
  save();
}

const save = () => {
  if (!state.career) return;
  const r = saveCareer(state.career);
  state.saveFail = !r.ok;
  state.saveSize = r.size;
};
const top = () => window.scrollTo(0, 0);

function onClick(e: MouseEvent): void {
  unlockAudio();
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
  if (state.busy && el?.dataset.a !== 'busy-cancel') return;
  if (!el || (el as HTMLButtonElement).disabled || el.tagName === 'SELECT') return;
  if (!['start', 'warn-go', 'warn-rest', 'se'].includes(el.dataset.a ?? '')) sfx.tap();
  const a = el.dataset.a, k = el.dataset.k ?? '', i = Number(el.dataset.i), id = Number(el.dataset.id);
  const c = state.career;

  switch (a) {
    case 'new': {
      const v = (document.getElementById('tname') as HTMLInputElement | null)?.value.trim() || 'マイチーム';
      const dv = (document.querySelector<HTMLInputElement>('input[name="diff"]:checked')?.value ?? 'normal') as Difficulty;
      state.career = newCareer(v, dv); state.last = null; state.tab = 'home'; state.screen = 'play'; state.menuOpen = false; save(); break;
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
    case 'menu': state.menu = k as MenuKey; state.menuTouched = true; if (c && c.auto.train === 'fixed') { c.auto.fixed = k; save(); } break;
    case 'start': {
      if (!c || c.phase !== 'season') break;
      const msg = c.auto.rest ? null : confirmMessage(c, state.menuTouched ? state.menu : chooseMenu(c, null, state.menu), state.practice);
      if (msg) { state.warn = msg; sfx.warn(); break; }
      doStart(c);
      break;
    }
    case 'warn-rest': if (c) { state.menu = 'rest'; state.menuTouched = true; state.practice = false; state.warn = null; doStart(c); } break;
    case 'warn-go': if (c) { state.warn = null; doStart(c); } break;
    case 'warn-cancel': state.warn = null; break;
    case 'diff': if (c) c.diff = k as Difficulty; if (c) save(); break;
    case 'auto-lineup': if (c) { c.auto.lineup = !c.auto.lineup; save(); } break;
    case 'auto-rest': if (c) { c.auto.rest = !c.auto.rest; save(); } break;
    case 'jump': state.tab = 'gm'; state.folds[k] = true; render(); document.querySelector(`[data-fold="${k}"]`)?.scrollIntoView({ block: 'start' }); return;
    case 'scout': if (c) { const err = dispatchScout(c, k as '野手' | '投手' | '素質'); if (err) alert(err); else save(); } break;
    case 'negotiate': if (c) { const t = negotiate(c, id, k as 'accept' | 'bargain'); if (t) { c.news.push(t); save(); } } break;
    case 'ngplus': if (c && c.ended && confirm(`いまのデータを引き継いで,${c.gen + 1}周目を始めます.よろしいですか?(先にバックアップをおすすめします)`)) { state.career = newCareer(userTeam(c).name, c.diff, c); state.last = null; state.tab = 'home'; state.screen = 'play'; save(); top(); } break;
    case 'vib': setVib(!sound.vib); break;
    case 'share-text': {
      if (!c) break;
      const text = k === 'game' && state.last?.game
        ? (() => { const g = state.last!.game!; return gameText(c, g.home.team.name, g.away.team.name, g.home.runs, g.away.runs, recap(g).headline); })()
        : seasonText(c);
      void shareText(text).then((m) => toast(m));
      return;
    }
    case 'share-img': if (c) void shareImage(c).then((m) => toast(m)); return;
    case 'hire': if (c) { const err = hireStaff(c, id); if (err) alert(err); else { sfx.coin(); save(); } } break;
    case 'fire': if (c && confirm('解雇します.よろしいですか?')) { const err = fireStaff(c, k as StaffRole); if (err) alert(err); else save(); } break;
    case 'auto-mode': if (c) { c.auto.mode = k as 'ability' | 'form' | 'develop'; save(); } break;
    case 'se': setSe(!sound.se); break;
    case 'term': state.term = k; break;
    case 'term-close': state.term = null; break;
    case 'glossary': state.term = '*'; state.menuOpen = false; break;
    case 'font': prefs.font = k as FontSize; savePrefs(); applyPrefs(); break;
    case 'theme': prefs.theme = k as Theme; savePrefs(); applyPrefs(); break;
    case 'tut-next': prefs.tut++; savePrefs(); break;
    case 'tut-skip': prefs.tutOn = false; savePrefs(); break;
    case 'tut-again': prefs.tut = 0; prefs.tutOn = true; savePrefs(); state.tab = 'home'; state.menuOpen = false; break;
    case 'bgm': setBgm(!sound.bgm); break;
    case 'train-mode': if (c) { c.auto.train = k as 'recommend' | 'fixed' | 'manual'; if (k === 'fixed') c.auto.fixed = state.menu; state.menuTouched = false; save(); } break;
    case 'month': if (c && c.phase === 'season' && !state.busy) { void runWeeks(c, 4, true); return; } break;
    case 'practice': state.practice = !state.practice; break;
    case 'game-pick': if (state.last) state.last.game = state.last.games[i] ?? state.last.game; break;
    case 'auto-season': if (c && c.phase === 'season' && !state.busy) { void runWeeks(c, 99, false); return; } break;
    case 'busy-cancel': if (state.busy) state.busy.cancel = true; return;
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
  downloadText(JSON.stringify(c), `diamond-kantoku-save-s${c.season}.json`);
  prefs.backup = c.season;
  savePrefs();
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
  applyPrefs();
  state.career = loadCareer();
  state.screen = 'title';
  document.addEventListener('click', (e) => { try { onClick(e); } catch (err) { showCrash(err); } });
  window.addEventListener('error', (e) => { if (e.error) showCrash(e.error); });
  window.addEventListener('unhandledrejection', (e) => { if (e.reason instanceof Error) showCrash(e.reason); });
  document.addEventListener('change', onChange);
  document.addEventListener('input', (e) => { const el = e.target as HTMLInputElement; if (el.dataset.vol) { setVolume(el.dataset.vol as 'se' | 'bgm', Number(el.value) / 100); } });
  document.addEventListener('change', (e) => { const el = e.target as HTMLInputElement; if (el.dataset.vol === 'se') sfx.ok(); });
  // シートが開いているあいだは,Tab キーでシートの外に出ない
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const sheet = root.querySelector<HTMLElement>('.sheet');
    if (!sheet) return;
    const f = [...sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href], select')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (state.menuOpen || state.detail !== null || state.term || state.warn)) { state.menuOpen = false; state.detail = null; state.term = null; state.warn = null; render(); } });
  // 折りたたみの開閉を覚えておく(再描画しても開いたままにするため)
  document.addEventListener('toggle', (e) => {
    const d = e.target as HTMLElement;
    if (d instanceof HTMLDetailsElement && d.dataset.fold) state.folds[d.dataset.fold] = d.open;
  }, true);
  render();
}

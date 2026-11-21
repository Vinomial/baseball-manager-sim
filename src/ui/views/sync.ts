/** 端末間の同期のシート(ログイン,同期の状態,食い違ったときの選択). */
import { sync } from '../../sync/client';
import { esc } from '../../util/format';

const when = (t: number): string => {
  if (!t) return 'まだ同期していません';
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 状態のひとこと(入力中に描き直さないよう,ここだけ差し替える) */
export function syncMsgHTML(): string {
  const s = sync.state();
  if (s.busy) return '同期しています…';
  return s.msg ? `<span${s.err ? ' style="color:var(--bad)"' : ''}>${esc(s.msg)}</span>` : '';
}

/** 最後に同期した時刻 */
export const syncLastText = (): string => `最後の同期: ${when(sync.state().last)}`;

export function syncSheet(): string {
  const s = sync.state();
  const head = `<div class="sheet-bg" data-a="sync-close"></div><div class="sheet" role="dialog" aria-label="端末間の同期">
  <div class="sheet-h"><b>☁ 端末間の同期</b><button class="btn ghost" data-a="sync-close" aria-label="閉じる">✕</button></div>`;
  const msg = `<p class="small" id="sync-msg" aria-live="polite" style="margin:0">${syncMsgHTML()}</p>`;
  if (s.email !== null) {
    return `${head}
    <p style="margin:0"><b>${esc(s.email || 'Google アカウント')}</b> でログインしています.</p>
    <p class="small muted" style="margin:0"><span id="sync-last">${syncLastText()}</span>.進めると,少しあとに自動でサーバーへ送ります.ほかの端末で開くと,新しいほうの進みにそろいます.</p>
    ${msg}
    <button class="btn" data-a="sync-now" ${s.busy ? 'disabled' : ''}>🔄 いま同期する</button>
    <button class="btn ghost" data-a="sync-out">ログアウト</button></div>`;
  }
  return `${head}
  <p class="small" style="margin:0">ログインすると,スマホと PC などで同じセーブを続きから遊べます(ログインは任意です).</p>
  <form class="syncform" onsubmit="return false">
    <input id="sync-email" type="email" autocomplete="username" placeholder="メールアドレス" aria-label="メールアドレス">
    <input id="sync-pw" type="password" autocomplete="current-password" placeholder="パスワード(6文字以上)" aria-label="パスワード">
  </form>
  ${msg}
  <button class="btn" data-a="sync-in">ログイン</button>
  <button class="btn ghost" data-a="sync-up">新しく登録する</button>
  <button class="btn ghost" data-a="sync-google">Google でログイン</button>
  <button class="btn ghost" data-a="sync-reset">パスワードを忘れたとき</button></div>`;
}

export function conflictSheet(): string {
  const c = sync.state().conflict!;
  return `<div class="sheet-bg"></div><div class="sheet" role="alertdialog" aria-label="どちらのセーブを残しますか">
  <div class="sheet-h"><b>☁ どちらのセーブを残しますか?</b></div>
  <p class="small" style="margin:0">この端末とサーバーの両方で,別々に進めたセーブがあります.残さなかったほうは消えます(心配なら,先にメニューの「バックアップを保存」をしてください).</p>
  <button class="btn" data-a="sync-keep" data-k="local"><b>この端末のセーブ</b><br><span class="small" style="font-weight:400">${esc(c.here || 'セーブなし')}</span></button>
  <button class="btn" data-a="sync-keep" data-k="remote"><b>サーバーのセーブ</b><br><span class="small" style="font-weight:400">${esc(c.there)}(${when(c.at)}に保存)</span></button>
  <button class="btn ghost" data-a="sync-later">あとで決める</button></div>`;
}

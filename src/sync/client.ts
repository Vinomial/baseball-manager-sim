/**
 * 端末間の同期の窓口.ログイン,いつ同期するか,この端末が覚えておくこと(localStorage)を受け持つ.
 * Firebase の SDK は,ログインしている(またはしようとした)ときだけ読み込む.
 * 画面は描かない.状態が変わったら on() で渡された関数を呼ぶ.
 */
import { COLLECTION, FIREBASE_CONFIG, USE_EMULATOR } from './config';
import { syncOnce, TooLargeError, type LocalSave, type Remote, type SyncMeta } from './engine';
import { firestoreRemote } from './firestore';

const KEY = 'baseball-manager-sim/sync';
/** 保存してから送るまで待つ時間(まとめて送る) */
const DEBOUNCE = 20_000;

/** base は uid のアカウントでそろえたときのもの(別のアカウントでは使わない) */
interface Mem extends SyncMeta { on: boolean; email: string; last: number; uid: string; }

export interface Hooks {
  /** 手元のセーブ.small なら古い記録を削ったもの */
  local(small: boolean): LocalSave | null;
  /** サーバーのセーブで置き換える.読めなければ false */
  apply(text: string): boolean;
  /** いま置き換えてよいか(試合の途中などは待つ) */
  canApply(): boolean;
}

export interface Conflict { here: string; there: string; at: number; }

export interface SyncState {
  email: string | null;
  busy: boolean;
  msg: string;
  err: boolean;
  last: number;
  conflict: Conflict | null;
}

type Fb = {
  auth: import('firebase/auth').Auth;
  U: typeof import('firebase/auth');
  remote: () => Remote;
};

const st = {
  fb: null as Fb | null,
  loading: null as Promise<Fb> | null,
  email: null as string | null,
  uid: null as string | null,
  busy: false, again: false, msg: '', err: false,
  conflict: null as Conflict | null,
  timer: 0 as ReturnType<typeof setTimeout> | 0,
  gen: 0,
  hooks: null as Hooks | null,
  listeners: [] as (() => void)[],
};

function mem(): Mem {
  const d: Mem = { on: false, email: '', last: 0, base: null, dirty: false, uid: '' };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Mem> }; } catch { return d; }
}
function remember(o: Partial<Mem>): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...mem(), ...o })); } catch { /* 無視 */ }
}
const notify = () => { for (const f of st.listeners) { try { f(); } catch { /* 無視 */ } } };
const setMsg = (msg: string, err = false) => { st.msg = msg; st.err = err; notify(); };

/** ログインのエラーを日本語に */
export function errText(e: unknown): string {
  if (e instanceof TooLargeError) return 'セーブが大きすぎて,サーバーに保存できません.';
  const c = (e as { code?: string })?.code ?? '';
  const t: Record<string, string> = {
    'auth/invalid-email': 'メールアドレスの形が正しくありません.',
    'auth/missing-password': 'パスワードを入れてください.',
    'auth/weak-password': 'パスワードは6文字以上にしてください.',
    'auth/email-already-in-use': 'このメールアドレスはもう登録されています.「ログイン」を押してください.',
    'auth/invalid-credential': 'メールアドレスかパスワードが違います.',
    'auth/wrong-password': 'メールアドレスかパスワードが違います.',
    'auth/user-not-found': 'このメールアドレスは登録されていません.',
    'auth/too-many-requests': '試行が多すぎます.しばらくしてからもう一度試してください.',
    'auth/popup-closed-by-user': 'ログインの画面が閉じられました.',
    'auth/cancelled-popup-request': 'ログインの画面が閉じられました.',
    'auth/popup-blocked': 'ログインの画面を開けませんでした.メールアドレスでログインしてください.',
    'auth/operation-not-supported-in-this-environment': 'この環境では Google でログインできません.メールアドレスでログインしてください.',
    'auth/unauthorized-domain': 'このサイトからのログインが許可されていません(Firebase の承認済みドメインを確認してください).',
    'auth/network-request-failed': '通信できませんでした.電波のよい所でもう一度試してください.',
    'permission-denied': 'サーバーに保存できませんでした(権限がありません).',
    'unavailable': '通信できませんでした.あとで自動で同期します.',
  };
  return t[c] ?? `うまくいきませんでした(${c || (e instanceof Error ? e.message : '不明なエラー')}).`;
}

async function load(): Promise<Fb> {
  if (st.fb) return st.fb;
  if (st.loading) return st.loading;
  st.loading = (async () => {
    const [A, U, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = A.initializeApp(FIREBASE_CONFIG!);
    const auth = U.getAuth(app);
    auth.languageCode = 'ja';
    const db = F.getFirestore(app);
    if (USE_EMULATOR) {
      U.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    const remote = (): Remote => firestoreRemote(F, db, `${COLLECTION}/${st.uid!}`);
    const fb: Fb = { auth, U, remote };
    st.fb = fb;
    U.onAuthStateChanged(auth, (user) => {
      const changed = (user?.uid ?? null) !== st.uid;
      st.uid = user?.uid ?? null;
      st.email = user ? user.email ?? '' : null;
      remember({ on: !!user, email: st.email ?? '' });
      notify();
      if (user && changed) void syncNow();
    });
    return fb;
  })();
  try { return await st.loading; } finally { st.loading = null; }
}

async function run(f: (fb: Fb) => Promise<unknown>, done = ''): Promise<void> {
  try { setMsg('処理しています…'); const fb = await load(); await f(fb); setMsg(done); } catch (e) { setMsg(errText(e), true); }
}

/** 1 回そろえる.keep は食い違ったときに選んだ側 */
async function syncNow(keep?: 'local' | 'remote'): Promise<void> {
  if (!st.fb || !st.uid || !st.hooks) return;
  if (st.busy) { st.again = true; return; }
  if (typeof navigator !== 'undefined' && !navigator.onLine) { setMsg('オフラインです.通信できるようになったら同期します.'); return; }
  if (st.timer) { clearTimeout(st.timer); st.timer = 0; }
  const hooks = st.hooks, gen = st.gen, m = mem();
  st.busy = true; notify();
  try {
    const r = await syncOnce({ remote: st.fb.remote(), meta: { base: m.uid === st.uid ? m.base : null, dirty: m.dirty }, local: hooks.local, keep });
    // 同期のあいだに手元で進めていたら,それを残す
    const moved = st.gen !== gen;
    if (r.kind === 'conflict') {
      st.conflict = { here: hooks.local(false)?.label ?? '', there: r.remote.label, at: r.remote.updatedAt };
      setMsg('');
      return;
    }
    st.conflict = null;
    if (r.kind === 'pulled') {
      if (moved || !hooks.canApply()) { st.again = true; return; }
      if (!hooks.apply(r.text)) { setMsg('サーバーのセーブを読み込めませんでした.', true); return; }
      st.gen++; // 置き換えたときの保存は,手元で進めたことにしない
    }
    const last = Date.now();
    remember({ uid: st.uid ?? '', base: r.meta.base, dirty: moved && r.kind !== 'pulled' ? true : r.meta.dirty, last });
    setMsg(r.kind === 'pulled' ? 'ほかの端末の進みを読み込みました.' : '');
  } catch (e) {
    setMsg(errText(e), true);
  } finally {
    st.busy = false; notify();
    if (st.again) { st.again = false; setTimeout(() => void syncNow(), 3000); }
  }
}

export const sync = {
  /** 設定があって,同期を使えるか */
  enabled: (): boolean => FIREBASE_CONFIG !== null,
  state(): SyncState {
    return { email: st.email, busy: st.busy, msg: st.msg, err: st.err, last: mem().last, conflict: st.conflict };
  },
  on(f: () => void): void { st.listeners.push(f); },
  /** 起動時に呼ぶ.この端末で前にログインしていたら,SDK を読み込んで同期する */
  start(hooks: Hooks): void {
    st.hooks = hooks;
    if (!sync.enabled()) return;
    if (mem().on) load().catch((e) => setMsg(errText(e), true));
  },
  /** 保存のたびに呼ぶ.少し待ってからまとめて送る */
  dirty(): void {
    st.gen++;
    remember({ dirty: true });
    if (!st.uid) return;
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(() => { st.timer = 0; void syncNow(); }, DEBOUNCE);
  },
  /** 画面を離れるときなど,待たずに送る */
  flush(): void { if (st.uid && !st.conflict) void syncNow(); },
  now: (): Promise<void> => syncNow(),
  keep: (side: 'local' | 'remote'): Promise<void> => syncNow(side),
  /** 食い違いを,あとで決めることにする(次に同期したときにまた聞く) */
  later(): void { st.conflict = null; notify(); },
  signIn: (email: string, pw: string) => run(({ auth, U }) => U.signInWithEmailAndPassword(auth, email, pw)),
  signUp: (email: string, pw: string) => run(({ auth, U }) => U.createUserWithEmailAndPassword(auth, email, pw)),
  google: () => run(({ auth, U }) => U.signInWithPopup(auth, new U.GoogleAuthProvider())),
  reset: (email: string) => run(({ auth, U }) => U.sendPasswordResetEmail(auth, email), 'パスワードを設定し直すメールを送りました.'),
  async signOut(): Promise<void> {
    if (!st.fb) return;
    if (!st.conflict) await syncNow();
    await st.fb.U.signOut(st.fb.auth);
    st.conflict = null;
    remember({ on: false, email: '' });
    setMsg('ログアウトしました.この端末のセーブはそのまま残ります.');
  },
};

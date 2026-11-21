/**
 * 端末間の同期の決まり(DOM にも Firebase にも触れない).
 *
 * サーバーには 1 人 1 つの文書を置く.中身は縮めたセーブと,保存の番号 rev.
 * この端末は「最後にそろえたときの rev(base)」と「そのあと手元で進めたか(dirty)」を覚えておく.
 *   - サーバーが base のまま        → 手元で進めていれば送る.進めていなければ何もしない.
 *   - サーバーが base より進んでいる → 手元で進めていなければ取り込む.両方進めていれば,どちらを残すか聞く.
 * 試合の進みは足し合わせられないので,食い違ったときは片方を選ぶ.
 * 書き込みは「サーバーの rev が読んだときのまま」のときだけ行う(ほかの端末と同時でも上書きしない).
 */
import { pack, unpack } from './codec';

/** サーバーの文書 */
export interface RemoteDoc {
  /** 縮めたセーブ(codec の pack) */
  data: string;
  /** 保存の番号.送るたびに 1 増える */
  rev: number;
  /** 送った時刻(ミリ秒) */
  updatedAt: number;
  /** 文書の形の版 */
  ver: number;
  /** どこまで進んだかの説明(食い違ったときに見せる) */
  label: string;
}

/** サーバーとのやりとり.本番は Firebase,テストは手元の入れ物. */
export interface Remote {
  read(): Promise<RemoteDoc | null>;
  /** サーバーの rev が expectRev(文書がなければ 0)のときだけ書き込み,書けたら true */
  write(doc: RemoteDoc, expectRev: number): Promise<boolean>;
}

/** この端末が覚えておくこと */
export interface SyncMeta {
  /** 最後にそろえたときのサーバーの rev.一度もそろえていなければ null */
  base: number | null;
  /** そのあと手元で進めたか */
  dirty: boolean;
}

/** 手元のセーブ */
export interface LocalSave { text: string; label: string; }

export type Plan = 'push' | 'pull' | 'none' | 'conflict';

/** 文書の形の版 */
export const DOC_VER = 1;
/** 縮めたセーブの上限(Firestore の 1 文書は 1MiB.ほかの項目のぶんを残す) */
export const MAX_DATA = 1_000_000;

/** どうするかを決める */
export function decide(hasLocal: boolean, meta: SyncMeta, remoteRev: number | null): Plan {
  if (remoteRev === null) return hasLocal ? 'push' : 'none';
  if (!hasLocal) return 'pull';
  if (meta.base === remoteRev) return meta.dirty ? 'push' : 'none';
  // 一度もそろえていない端末のセーブは,サーバーと別物かもしれないので聞く
  return meta.dirty || meta.base === null ? 'conflict' : 'pull';
}

export type SyncResult =
  | { kind: 'none'; meta: SyncMeta }
  | { kind: 'pushed'; meta: SyncMeta }
  | { kind: 'pulled'; meta: SyncMeta; text: string; label: string }
  | { kind: 'conflict'; meta: SyncMeta; remote: { label: string; updatedAt: number; rev: number } };

export class TooLargeError extends Error {
  constructor() { super('too-large'); this.name = 'TooLargeError'; }
}

export interface SyncOptions {
  remote: Remote;
  meta: SyncMeta;
  /** 手元のセーブ.small なら古い記録を削って小さくしたもの.セーブがなければ null */
  local: (small: boolean) => LocalSave | null;
  /** 食い違ったときに選んだ側 */
  keep?: 'local' | 'remote';
  now?: () => number;
}

async function packLocal(local: SyncOptions['local']): Promise<{ data: string; label: string }> {
  let l = local(false)!;
  let data = await pack(l.text);
  if (data.length > MAX_DATA) {
    l = local(true)!;
    data = await pack(l.text);
    if (data.length > MAX_DATA) throw new TooLargeError();
  }
  return { data, label: l.label };
}

/** 1 回そろえる.ほかの端末と書き込みがぶつかったら,読み直してやり直す. */
export async function syncOnce(o: SyncOptions): Promise<SyncResult> {
  const now = o.now ?? Date.now;
  let keep = o.keep;
  for (let tries = 0; tries < 3; tries++) {
    const remote = await o.remote.read();
    const hasLocal = o.local(false) !== null;
    let plan = decide(hasLocal, o.meta, remote ? remote.rev : null);
    if (plan === 'conflict' && keep) plan = keep === 'local' ? 'push' : 'pull';
    if (plan === 'none') return { kind: 'none', meta: { base: remote ? remote.rev : o.meta.base, dirty: false } };
    if (plan === 'conflict') return { kind: 'conflict', meta: o.meta, remote: { label: remote!.label, updatedAt: remote!.updatedAt, rev: remote!.rev } };
    if (plan === 'pull') {
      const text = await unpack(remote!.data);
      return { kind: 'pulled', meta: { base: remote!.rev, dirty: false }, text, label: remote!.label };
    }
    const expect = remote ? remote.rev : 0;
    const { data, label } = await packLocal(o.local);
    const doc: RemoteDoc = { data, rev: expect + 1, updatedAt: now(), ver: DOC_VER, label };
    if (await o.remote.write(doc, expect)) return { kind: 'pushed', meta: { base: doc.rev, dirty: false } };
    // 読んでから書くまでのあいだに,ほかの端末が書いた.選んだときと中身が変わったので,もう一度聞く
    keep = undefined;
  }
  throw new Error('ほかの端末と同時に保存が続いたため,同期できませんでした.');
}

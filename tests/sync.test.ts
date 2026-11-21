import { describe, expect, it } from 'vitest';
import { pack, unpack } from '../src/sync/codec';
import { decide, MAX_DATA, syncOnce, TooLargeError, type LocalSave, type Remote, type RemoteDoc, type SyncMeta } from '../src/sync/engine';

/** 手元で動くサーバーの代わり */
function memRemote(): Remote & { doc: RemoteDoc | null; writes: number; before?: () => void } {
  const r = {
    doc: null as RemoteDoc | null,
    writes: 0,
    before: undefined as undefined | (() => void),
    async read() { return r.doc ? { ...r.doc } : null; },
    async write(d: RemoteDoc, expect: number) {
      r.before?.();
      if ((r.doc ? r.doc.rev : 0) !== expect) return false;
      r.doc = { ...d }; r.writes++;
      return true;
    },
  };
  return r;
}

const save = (text: string): (() => LocalSave) => () => ({ text, label: text });
const fresh: SyncMeta = { base: null, dirty: false };

describe('codec', () => {
  it('縮めて元に戻せる(日本語と大きな文字列)', async () => {
    const text = JSON.stringify({ name: 'ダイヤモンド監督', list: Array.from({ length: 50000 }, (_, i) => ({ i, s: `選手${i % 300}` })) });
    const b = await pack(text);
    expect(b.length).toBeLessThan(text.length / 4);
    expect(await unpack(b)).toBe(text);
  });
});

describe('decide', () => {
  it('サーバーが空なら,手元があれば送る', () => {
    expect(decide(true, fresh, null)).toBe('push');
    expect(decide(false, fresh, null)).toBe('none');
  });
  it('手元にセーブがなければ取り込む', () => {
    expect(decide(false, fresh, 3)).toBe('pull');
  });
  it('サーバーが前にそろえたままなら,手元で進めたときだけ送る', () => {
    expect(decide(true, { base: 3, dirty: true }, 3)).toBe('push');
    expect(decide(true, { base: 3, dirty: false }, 3)).toBe('none');
  });
  it('サーバーだけが進んでいれば取り込み,両方なら聞く', () => {
    expect(decide(true, { base: 3, dirty: false }, 5)).toBe('pull');
    expect(decide(true, { base: 3, dirty: true }, 5)).toBe('conflict');
  });
  it('一度もそろえていない端末にセーブがあり,サーバーにもあれば聞く', () => {
    expect(decide(true, fresh, 1)).toBe('conflict');
  });
});

describe('syncOnce', () => {
  it('A で送り,B で取り込み,B で進めて送ると A が取り込む', async () => {
    const r = memRemote();
    const a1 = await syncOnce({ remote: r, meta: fresh, local: save('A-1') });
    expect(a1.kind).toBe('pushed');
    expect(r.doc!.rev).toBe(1);

    const b1 = await syncOnce({ remote: r, meta: fresh, local: () => null });
    expect(b1).toMatchObject({ kind: 'pulled', text: 'A-1', meta: { base: 1, dirty: false } });

    const b2 = await syncOnce({ remote: r, meta: { base: 1, dirty: true }, local: save('B-2') });
    expect(b2).toMatchObject({ kind: 'pushed', meta: { base: 2 } });

    const a2 = await syncOnce({ remote: r, meta: a1.meta, local: save('A-1') });
    expect(a2).toMatchObject({ kind: 'pulled', text: 'B-2' });
  });

  it('両方で進めたら聞き,選んだ側にそろえる', async () => {
    const r = memRemote();
    await syncOnce({ remote: r, meta: fresh, local: save('A') });
    await syncOnce({ remote: r, meta: { base: 1, dirty: true }, local: save('B') });
    const meta = { base: 1, dirty: true };
    const c = await syncOnce({ remote: r, meta, local: save('A2') });
    expect(c).toMatchObject({ kind: 'conflict', remote: { label: 'B', rev: 2 } });
    expect(r.writes).toBe(2);

    const keepLocal = await syncOnce({ remote: r, meta, local: save('A2'), keep: 'local' });
    expect(keepLocal.kind).toBe('pushed');
    expect(await unpack(r.doc!.data)).toBe('A2');
    expect(r.doc!.rev).toBe(3);

    const r2 = memRemote();
    await syncOnce({ remote: r2, meta: fresh, local: save('X') });
    const keepRemote = await syncOnce({ remote: r2, meta: fresh, local: save('Y'), keep: 'remote' });
    expect(keepRemote).toMatchObject({ kind: 'pulled', text: 'X', meta: { base: 1, dirty: false } });
  });

  it('読んでから書くまでにほかの端末が書いたら,上書きせず考え直す', async () => {
    const r = memRemote();
    await syncOnce({ remote: r, meta: fresh, local: save('A') });
    // B が書き込む直前に,C が書き込む
    r.before = () => { r.before = undefined; r.doc = { ...r.doc!, rev: 2, label: 'C' }; };
    const res = await syncOnce({ remote: r, meta: { base: 1, dirty: true }, local: save('B') });
    expect(res).toMatchObject({ kind: 'conflict', remote: { label: 'C' } });
    expect(r.doc!.label).toBe('C');
  });

  it('選んだあとにほかの端末が書いたら,選び直してもらう', async () => {
    const r = memRemote();
    await syncOnce({ remote: r, meta: fresh, local: save('A') });
    r.before = () => { r.before = undefined; r.doc = { ...r.doc!, rev: 2, label: 'C' }; };
    const res = await syncOnce({ remote: r, meta: { base: 0, dirty: true }, local: save('B'), keep: 'local' });
    expect(res.kind).toBe('conflict');
    expect(r.doc!.label).toBe('C');
  });

  it('大きすぎるときは小さくしたものを送り,それでも大きければ送らない', async () => {
    // 縮みにくい文字列(乱数)を作る
    let seed = 1;
    const noise = (n: number) => Array.from({ length: n }, () => { seed = (seed * 48271) % 2147483647; return String.fromCharCode(33 + (seed % 90)); }).join('');
    const big = noise(MAX_DATA);
    const r = memRemote();
    const res = await syncOnce({ remote: r, meta: fresh, local: (small) => ({ text: small ? 'small' : big, label: small ? 's' : 'b' }) });
    expect(res.kind).toBe('pushed');
    expect(r.doc!.label).toBe('s');
    await expect(syncOnce({ remote: memRemote(), meta: fresh, local: () => ({ text: big, label: 'b' }) })).rejects.toBeInstanceOf(TooLargeError);
  });
});

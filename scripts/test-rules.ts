/**
 * Firestore のアクセス規則(firestore.rules)と,同期の書き込み(src/sync)のテスト.エミュレーターで動かす.
 * 使い方: npm run test:rules   (Java が必要.本番には通信しない)
 */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import { syncOnce, type RemoteDoc } from '../src/sync/engine';
import { firestoreRemote } from '../src/sync/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-diamond',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const db = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as F.Firestore;
const alice = db('alice'), bob = db('bob'), anon = db(null);
const ok = (rev: number): RemoteDoc => ({ data: 'H4sI', rev, updatedAt: Date.now(), ver: 1, label: 'テスト' });
const ref = (d: F.Firestore, p = 'saves/alice') => F.doc(d, p);

let n = 0;
const t = async (name: string, p: Promise<unknown>) => { await p; n++; console.log(`ok  ${name}`); };

await t('本人は rev 1 で自分の文書を作れる', assertSucceeds(F.setDoc(ref(alice), ok(1))));
await t('本人は自分の文書を読める', assertSucceeds(F.getDoc(ref(alice))));
await t('rev を 1 増やせば更新できる', assertSucceeds(F.setDoc(ref(alice), ok(2))));
await t('rev が増えていなければ更新できない(古い端末の上書きを防ぐ)', assertFails(F.setDoc(ref(alice), ok(2))));
await t('rev を飛ばして更新できない', assertFails(F.setDoc(ref(alice), ok(5))));
await t('rev 1 以外で作れない', assertFails(F.setDoc(ref(alice, 'saves/carol'), ok(3))));
await t('他人の文書は読めない', assertFails(F.getDoc(ref(bob))));
await t('他人の文書は書けない', assertFails(F.setDoc(ref(bob), ok(3))));
await t('他人の文書は消せない', assertFails(F.deleteDoc(ref(bob))));
await t('ログインしていない人は読めない', assertFails(F.getDoc(ref(anon))));
await t('ログインしていない人は書けない', assertFails(F.setDoc(ref(anon, 'saves/anon'), ok(1))));
await t('一覧の取得はできない', assertFails(F.getDocs(F.collection(alice, 'saves'))));
await t('決まった項目以外は書けない', assertFails(F.setDoc(ref(alice), { ...ok(3), admin: true })));
await t('data が文字列でなければ書けない', assertFails(F.setDoc(ref(alice), { ...ok(3), data: 1 })));
await t('data が大きすぎれば書けない', assertFails(F.setDoc(ref(alice), { ...ok(3), data: 'x'.repeat(1_000_001) })));
await t('data がちょうど上限なら書ける', assertSucceeds(F.setDoc(ref(alice), { ...ok(3), data: 'x'.repeat(1_000_000) })));
await t('saves 以外の場所には書けない', assertFails(F.setDoc(ref(alice, 'other/alice'), ok(1))));
await t('saves の下の別の場所には書けない', assertFails(F.setDoc(ref(alice, 'saves/alice/sub/x'), ok(1))));
await t('本人は自分の文書を消せる', assertSucceeds(F.deleteDoc(ref(alice))));

// 同期の処理を,本物の規則とトランザクションで通す(2 台の端末)
const ra = firestoreRemote(F, db('dave'), 'saves/dave'), rb = firestoreRemote(F, db('dave'), 'saves/dave');
const a1 = await syncOnce({ remote: ra, meta: { base: null, dirty: false }, local: () => ({ text: 'A のセーブ', label: 'A' }) });
await t('1 台目が送れる', Promise.resolve(a1.kind === 'pushed' || Promise.reject(new Error(a1.kind))));
const b1 = await syncOnce({ remote: rb, meta: { base: null, dirty: false }, local: () => null });
await t('2 台目が取り込める', Promise.resolve((b1.kind === 'pulled' && b1.text === 'A のセーブ') || Promise.reject(new Error(b1.kind))));
const b2 = await syncOnce({ remote: rb, meta: { base: 1, dirty: true }, local: () => ({ text: 'B のセーブ', label: 'B' }) });
await t('2 台目で進めて送れる(rev 2)', Promise.resolve(b2.kind === 'pushed' || Promise.reject(new Error(b2.kind))));
const a2 = await syncOnce({ remote: ra, meta: { base: 1, dirty: true }, local: () => ({ text: 'A2', label: 'A2' }) });
await t('両方で進めたら聞く', Promise.resolve(a2.kind === 'conflict' || Promise.reject(new Error(a2.kind))));
const a3 = await syncOnce({ remote: ra, meta: { base: 1, dirty: true }, local: () => ({ text: 'A2', label: 'A2' }), keep: 'local' });
await t('この端末を選べば送れる(rev 3)', Promise.resolve(a3.kind === 'pushed' && a3.meta.base === 3 || Promise.reject(new Error(a3.kind))));

await env.cleanup();
console.log(`\n${n} 件のテストに合格しました`);
process.exit(0);

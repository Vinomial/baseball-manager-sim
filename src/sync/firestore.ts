/** Firestore の 1 つの文書を,同期のサーバー(Remote)として使う. */
import type * as FS from 'firebase/firestore';
import type { Remote, RemoteDoc } from './engine';

export function firestoreRemote(F: typeof FS, db: FS.Firestore, path: string): Remote {
  const ref = F.doc(db, path);
  return {
    async read() {
      const s = await F.getDoc(ref);
      return s.exists() ? (s.data() as RemoteDoc) : null;
    },
    async write(doc, expect) {
      // 読んで,rev が思ったとおりのときだけ書く(トランザクションなので,ほかの端末と同時でも食い違わない)
      return F.runTransaction(db, async (tx) => {
        const s = await tx.get(ref);
        const rev = s.exists() ? (s.data() as RemoteDoc).rev : 0;
        if (rev !== expect) return false;
        tx.set(ref, doc);
        return true;
      });
    },
  };
}

/* ============================================================
   KLADDE TIL "SÆT TIL SALG"
   Felterne ligger i localStorage, billederne i IndexedDB (localStorage
   kan ikke rumme filer). Begge dele er nøglet på bruger-id, så to
   personer på samme computer ikke ser hinandens kladde. Intet forlader
   browseren; kladden slettes når annoncen er oprettet.
   ============================================================ */

const FIELDS_PREFIX = 'cb_sell_draft_v2:';
const LEGACY_KEY    = 'cb_sell_draft_v1';   // før 11. okt.: én kladde pr. browser, ingen billeder
const DB_NAME       = 'cykelboersen';
const STORE         = 'sell-draft-images';
const MAX_AGE_MS    = 30 * 24 * 60 * 60 * 1000;

export function readDraftFields(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(FIELDS_PREFIX + userId);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft?._savedAt || Date.now() - draft._savedAt > MAX_AGE_MS) {
      clearDraft(userId);
      return null;
    }
    return draft;
  } catch { return null; }
}

export function writeDraftFields(userId, draft) {
  if (!userId) return;
  try {
    localStorage.setItem(FIELDS_PREFIX + userId, JSON.stringify(draft));
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* fuld eller blokeret lagring: ingen kladde, men flowet virker */ }
}

export function clearDraft(userId) {
  try {
    localStorage.removeItem(LEGACY_KEY);
    if (userId) localStorage.removeItem(FIELDS_PREFIX + userId);
  } catch {}
  if (userId) withStore('readwrite', s => s.delete(userId)).catch(() => {});
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror    = () => reject(tx.error);
      tx.onabort    = () => reject(tx.error);
    });
  } finally { db.close(); }
}

/** files: File[] i den rækkefølge de vises (det første er forsidebilledet). */
export function writeDraftImages(userId, files) {
  if (!userId) return Promise.resolve();
  const rows = files.map(f => ({ blob: f, name: f.name || 'billede.jpg', type: f.type || 'image/jpeg' }));
  return withStore('readwrite', s => rows.length ? s.put(rows, userId) : s.delete(userId))
    .catch(() => {});
}

/** Returnerer File[] (tom liste hvis ingen eller hvis browseren ikke kan). */
export async function readDraftImages(userId) {
  if (!userId) return [];
  try {
    const rows = await withStore('readonly', s => s.get(userId));
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(r => r?.blob)
      .map(r => new File([r.blob], r.name, { type: r.type }));
  } catch { return []; }
}

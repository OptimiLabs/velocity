/**
 * Thin IndexedDB wrapper for terminal scrollback persistence.
 * Uses raw IndexedDB APIs — no additional dependencies.
 */

const DB_NAME = "velocity-terminal-scrollback";
const DB_VERSION = 1;
const BUFFERS_STORE = "buffers";
const ARCHIVED_STORE = "archived-buffers";

interface ScrollbackEntry {
  terminalId: string;
  data: string;
  savedAt: number;
  sessionId?: string;
}

// Lazy singleton DB connection
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in SSR"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(BUFFERS_STORE)) {
        db.createObjectStore(BUFFERS_STORE, { keyPath: "terminalId" });
      }

      if (!db.objectStoreNames.contains(ARCHIVED_STORE)) {
        const archived = db.createObjectStore(ARCHIVED_STORE, {
          keyPath: "terminalId",
        });
        archived.createIndex("sessionId", "sessionId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

/** Upsert scrollback data into the buffers store. */
export async function saveScrollback(
  terminalId: string,
  data: string,
  sessionId?: string,
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const db = await openDB();
    const tx = db.transaction(BUFFERS_STORE, "readwrite");
    const store = tx.objectStore(BUFFERS_STORE);

    const entry: ScrollbackEntry = {
      terminalId,
      data,
      savedAt: Date.now(),
      ...(sessionId !== undefined && { sessionId }),
    };

    store.put(entry);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[terminal-db] saveScrollback failed:", err);
  }
}

/** Load scrollback data for a terminal, or null if not found. */
export async function loadScrollback(
  terminalId: string,
): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const db = await openDB();
    const tx = db.transaction(BUFFERS_STORE, "readonly");
    const store = tx.objectStore(BUFFERS_STORE);
    const request = store.get(terminalId);

    return await new Promise<string | null>((resolve, reject) => {
      request.onsuccess = () => {
        const entry = request.result as ScrollbackEntry | undefined;
        resolve(entry?.data ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[terminal-db] loadScrollback failed:", err);
    return null;
  }
}

/** Delete scrollback data for a terminal. */
export async function deleteScrollback(terminalId: string): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const db = await openDB();
    const tx = db.transaction(BUFFERS_STORE, "readwrite");
    const store = tx.objectStore(BUFFERS_STORE);
    store.delete(terminalId);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[terminal-db] deleteScrollback failed:", err);
  }
}

/** Delete entries from buffers store older than maxAgeDays. */
export async function clearOldScrollback(maxAgeDays = 7): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const db = await openDB();
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const tx = db.transaction(BUFFERS_STORE, "readwrite");
    const store = tx.objectStore(BUFFERS_STORE);
    const request = store.openCursor();

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }

        const entry = cursor.value as ScrollbackEntry;
        if (entry.savedAt < cutoff) {
          cursor.delete();
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[terminal-db] clearOldScrollback failed:", err);
  }
}

/**
 * Archive a terminal's scrollback: copy from buffers to archived-buffers
 * with the given sessionId, then delete from buffers.
 */
export async function archiveScrollback(
  terminalId: string,
  sessionId: string,
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const db = await openDB();
    const tx = db.transaction([BUFFERS_STORE, ARCHIVED_STORE], "readwrite");
    const buffersStore = tx.objectStore(BUFFERS_STORE);
    const archivedStore = tx.objectStore(ARCHIVED_STORE);

    const getRequest = buffersStore.get(terminalId);

    await new Promise<void>((resolve, reject) => {
      getRequest.onsuccess = () => {
        const entry = getRequest.result as ScrollbackEntry | undefined;
        if (!entry) {
          resolve();
          return;
        }

        const archived: ScrollbackEntry = {
          terminalId: entry.terminalId,
          data: entry.data,
          savedAt: entry.savedAt,
          sessionId,
        };

        archivedStore.put(archived);
        buffersStore.delete(terminalId);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[terminal-db] archiveScrollback failed:", err);
  }
}

/** Load archived scrollback data for a terminal, or null if not found. */
export async function loadArchivedScrollback(
  terminalId: string,
): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const db = await openDB();
    const tx = db.transaction(ARCHIVED_STORE, "readonly");
    const store = tx.objectStore(ARCHIVED_STORE);
    const request = store.get(terminalId);

    return await new Promise<string | null>((resolve, reject) => {
      request.onsuccess = () => {
        const entry = request.result as ScrollbackEntry | undefined;
        resolve(entry?.data ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[terminal-db] loadArchivedScrollback failed:", err);
    return null;
  }
}

/** List all archived scrollback entries (without data for efficiency). */
export async function listArchivedScrollbacks(): Promise<
  Array<{ terminalId: string; savedAt: number; sessionId?: string }>
> {
  if (typeof window === "undefined") return [];

  try {
    const db = await openDB();
    const tx = db.transaction(ARCHIVED_STORE, "readonly");
    const store = tx.objectStore(ARCHIVED_STORE);
    const request = store.openCursor();

    const results: Array<{
      terminalId: string;
      savedAt: number;
      sessionId?: string;
    }> = [];

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }

        const entry = cursor.value as ScrollbackEntry;
        results.push({
          terminalId: entry.terminalId,
          savedAt: entry.savedAt,
          ...(entry.sessionId !== undefined && {
            sessionId: entry.sessionId,
          }),
        });
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    return results;
  } catch (err) {
    console.error("[terminal-db] listArchivedScrollbacks failed:", err);
    return [];
  }
}

/** Delete an archived scrollback entry. */
export async function deleteArchivedScrollback(
  terminalId: string,
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const db = await openDB();
    const tx = db.transaction(ARCHIVED_STORE, "readwrite");
    const store = tx.objectStore(ARCHIVED_STORE);
    store.delete(terminalId);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[terminal-db] deleteArchivedScrollback failed:", err);
  }
}

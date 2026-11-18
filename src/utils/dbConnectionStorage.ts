export type DbActiveTarget = 'AUTO' | 'LOCAL' | 'CLOUD' | 'HYBRID_DISK';

export interface SavedDbConnectionSettings {
  localDbUrl: string;
  cloudDbUrl: string;
  activeTarget: DbActiveTarget;
  deviceLabel: string;
  autoCheckCloudUpdates: boolean;
  cloudCheckIntervalSec: number;
  updatedAt: string;
}

const STORAGE_KEY = 'kpims_db_connection_settings_v1';
const IDB_NAME = 'kpims_browser_settings_db';
const IDB_STORE = 'db_connections';
const IDB_RECORD_KEY = 'dual_db_config';

const DEFAULT_SETTINGS: SavedDbConnectionSettings = {
  localDbUrl: '',
  cloudDbUrl: '',
  activeTarget: 'AUTO',
  deviceLabel: '',
  autoCheckCloudUpdates: false,
  cloudCheckIntervalSec: 120,
  updatedAt: '',
};

export const isMaskedDbUrl = (rawUrl?: string | null): boolean => {
  const val = String(rawUrl || '').trim();
  if (!val) return false;
  return /:[\*]{2,}@/.test(val);
};

export const stripPasswordForEndpointMatch = (rawUrl?: string | null): string => {
  const val = String(rawUrl || '').trim();
  if (!val) return '';
  try {
    const parsed = new URL(val);
    return `${parsed.protocol}//${parsed.username}@${parsed.hostname}:${parsed.port || ''}${parsed.pathname}`.toLowerCase();
  } catch {
    return val.replace(/:([^:@/]+)@/, ':***@').toLowerCase();
  }
};

export const isSameDbEndpointIgnoringPassword = (a?: string | null, b?: string | null): boolean => {
  const sa = stripPasswordForEndpointMatch(a);
  const sb = stripPasswordForEndpointMatch(b);
  return Boolean(sa && sb && sa === sb);
};

function normalizeTarget(raw: unknown): DbActiveTarget {
  return raw === 'LOCAL' || raw === 'CLOUD' || raw === 'HYBRID_DISK' || raw === 'AUTO'
    ? raw
    : 'AUTO';
}

function normalizeInterval(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 30 && n <= 3600 ? Math.round(n) : 120;
}

function sanitizeUrlCandidate(raw?: string | null): string {
  const val = String(raw || '').trim();
  if (!val || isMaskedDbUrl(val)) return '';
  return val;
}

export function loadSavedDbConnectionSettings(): SavedDbConnectionSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
    return {
      localDbUrl: sanitizeUrlCandidate(parsed.localDbUrl),
      cloudDbUrl: sanitizeUrlCandidate(parsed.cloudDbUrl),
      activeTarget: normalizeTarget(parsed.activeTarget),
      deviceLabel: typeof parsed.deviceLabel === 'string' ? parsed.deviceLabel : '',
      autoCheckCloudUpdates: Boolean(parsed.autoCheckCloudUpdates),
      cloudCheckIntervalSec: normalizeInterval(parsed.cloudCheckIntervalSec),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function openSettingsIdb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readSettingsFromIdb(): Promise<SavedDbConnectionSettings | null> {
  const db = await openSettingsIdb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_RECORD_KEY);
      getReq.onsuccess = () => {
        const val = getReq.result;
        db.close();
        if (!val || typeof val !== 'object') {
          resolve(null);
          return;
        }
        resolve({
          localDbUrl: sanitizeUrlCandidate(val.localDbUrl),
          cloudDbUrl: sanitizeUrlCandidate(val.cloudDbUrl),
          activeTarget: normalizeTarget(val.activeTarget),
          deviceLabel: typeof val.deviceLabel === 'string' ? val.deviceLabel : '',
          autoCheckCloudUpdates: Boolean(val.autoCheckCloudUpdates),
          cloudCheckIntervalSec: normalizeInterval(val.cloudCheckIntervalSec),
          updatedAt: typeof val.updatedAt === 'string' ? val.updatedAt : '',
        });
      };
      getReq.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeSettingsToIdb(settings: SavedDbConnectionSettings): Promise<void> {
  const db = await openSettingsIdb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(settings, IDB_RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadSavedDbConnectionSettingsAsync(): Promise<SavedDbConnectionSettings> {
  const ls = loadSavedDbConnectionSettings();
  if (ls.localDbUrl || ls.cloudDbUrl || ls.updatedAt) {
    return ls;
  }
  const idb = await readSettingsFromIdb();
  if (idb && (idb.localDbUrl || idb.cloudDbUrl || idb.updatedAt)) {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(idb));
    } catch {
      // ignore localStorage quota errors
    }
    return idb;
  }
  return ls;
}

export function saveDbConnectionSettings(
  patch: Partial<SavedDbConnectionSettings>,
  options?: { allowClearLocal?: boolean; allowClearCloud?: boolean },
): SavedDbConnectionSettings {
  const current = loadSavedDbConnectionSettings();

  let nextLocalDbUrl = current.localDbUrl;
  if (patch.localDbUrl !== undefined) {
    const trimmed = String(patch.localDbUrl || '').trim();
    if (!trimmed) {
      if (options?.allowClearLocal) nextLocalDbUrl = '';
    } else if (!isMaskedDbUrl(trimmed)) {
      nextLocalDbUrl = trimmed;
    }
  }

  let nextCloudDbUrl = current.cloudDbUrl;
  if (patch.cloudDbUrl !== undefined) {
    const trimmed = String(patch.cloudDbUrl || '').trim();
    if (!trimmed) {
      if (options?.allowClearCloud) nextCloudDbUrl = '';
    } else if (!isMaskedDbUrl(trimmed)) {
      nextCloudDbUrl = trimmed;
    }
  }

  const next: SavedDbConnectionSettings = {
    localDbUrl: nextLocalDbUrl,
    cloudDbUrl: nextCloudDbUrl,
    activeTarget:
      patch.activeTarget !== undefined ? normalizeTarget(patch.activeTarget) : current.activeTarget,
    deviceLabel:
      patch.deviceLabel !== undefined ? String(patch.deviceLabel || '').trim() : current.deviceLabel,
    autoCheckCloudUpdates:
      patch.autoCheckCloudUpdates !== undefined
        ? Boolean(patch.autoCheckCloudUpdates)
        : current.autoCheckCloudUpdates,
    cloudCheckIntervalSec:
      patch.cloudCheckIntervalSec !== undefined
        ? normalizeInterval(patch.cloudCheckIntervalSec)
        : current.cloudCheckIntervalSec,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota failure
    }
  }
  void writeSettingsToIdb(next);
  return next;
}

export function clearSavedDbConnectionUrl(target: 'LOCAL' | 'CLOUD'): SavedDbConnectionSettings {
  return saveDbConnectionSettings(
    target === 'LOCAL' ? { localDbUrl: '' } : { cloudDbUrl: '' },
    target === 'LOCAL' ? { allowClearLocal: true } : { allowClearCloud: true },
  );
}

/**
 * Syncs browser-persisted DB credentials with the server on login/app startup:
 * - If the browser already holds saved URLs/preferences that the server does not have yet
 *   (e.g., fresh workspace/server restart or new session), automatically restores them to /api/db/config.
 * - If the server already holds saved configuration, mirrors non-secret preferences to browser storage
 *   without ever overwriting unmasked browser credentials with masked `:****@` strings.
 */
export async function syncSavedDbSettingsWithBackend(): Promise<{
  restoredToServer: boolean;
  autoCheckCloudUpdates?: boolean;
  cloudCheckIntervalSec?: number;
  serverConfig?: any;
  savedSettings: SavedDbConnectionSettings;
}> {
  const saved = await loadSavedDbConnectionSettingsAsync();
  try {
    const res = await fetch('/api/db/config');
    const json = await res.json();
    if (!res.ok || !json?.success || !json.data) {
      return {
        restoredToServer: false,
        autoCheckCloudUpdates: saved.autoCheckCloudUpdates,
        cloudCheckIntervalSec: saved.cloudCheckIntervalSec,
        savedSettings: saved,
      };
    }
    const serverCfg = json.data;
    const needsLocalRestore = Boolean(saved.localDbUrl && !serverCfg.hasLocalDbUrl);
    const needsCloudRestore = Boolean(saved.cloudDbUrl && !serverCfg.hasCloudDbUrl);

    if (needsLocalRestore || needsCloudRestore) {
      const payload: Record<string, any> = {
        activeTarget: saved.activeTarget,
        autoCheckCloudUpdates: saved.autoCheckCloudUpdates,
        cloudCheckIntervalSec: saved.cloudCheckIntervalSec,
      };
      if (needsLocalRestore) payload.localDbUrl = saved.localDbUrl;
      if (needsCloudRestore) payload.cloudDbUrl = saved.cloudDbUrl;
      if (saved.deviceLabel) payload.deviceLabel = saved.deviceLabel;

      const putRes = await fetch('/api/db/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const putJson = await putRes.json().catch(() => null);
      return {
        restoredToServer: Boolean(putRes.ok && putJson?.success),
        autoCheckCloudUpdates: saved.autoCheckCloudUpdates,
        cloudCheckIntervalSec: saved.cloudCheckIntervalSec,
        serverConfig: putJson?.data || serverCfg,
        savedSettings: saved,
      };
    }

    // Server already has configuration; keep non-secret prefs in sync without wiping unmasked browser URLs
    const updatedSaved = saveDbConnectionSettings({
      activeTarget: saved.updatedAt ? saved.activeTarget : serverCfg.activeTarget,
      deviceLabel: saved.deviceLabel || serverCfg.deviceLabel || '',
      autoCheckCloudUpdates:
        saved.updatedAt ? saved.autoCheckCloudUpdates : Boolean(serverCfg.autoCheckCloudUpdates),
      cloudCheckIntervalSec:
        saved.updatedAt ? saved.cloudCheckIntervalSec : serverCfg.cloudCheckIntervalSec,
    });

    return {
      restoredToServer: false,
      autoCheckCloudUpdates: Boolean(serverCfg.autoCheckCloudUpdates ?? updatedSaved.autoCheckCloudUpdates),
      cloudCheckIntervalSec:
        typeof serverCfg.cloudCheckIntervalSec === 'number'
          ? serverCfg.cloudCheckIntervalSec
          : updatedSaved.cloudCheckIntervalSec,
      serverConfig: serverCfg,
      savedSettings: updatedSaved,
    };
  } catch {
    return {
      restoredToServer: false,
      autoCheckCloudUpdates: saved.autoCheckCloudUpdates,
      cloudCheckIntervalSec: saved.cloudCheckIntervalSec,
      savedSettings: saved,
    };
  }
}

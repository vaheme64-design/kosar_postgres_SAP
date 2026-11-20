import { useState, useCallback, useEffect } from 'react';

const PREFIX = 'kpims_ui_v1:';

function safeReadStorage<T>(fullKey: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(fullKey);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteStorage<T>(fullKey: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(fullKey, JSON.stringify(value));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

/**
 * Generic persisted state hook for UI collapse/selection preferences.
 */
export function usePersistedValue<T>(key: string, defaultValue: T) {
  const fullKey = `${PREFIX}val:${key}`;
  const [value, setValueState] = useState<T>(() => safeReadStorage<T>(fullKey, defaultValue));

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValueState(prev => {
        const next = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        safeWriteStorage(fullKey, next);
        return next;
      });
    },
    [fullKey],
  );

  // Sync across tabs/windows if needed
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === fullKey && e.newValue !== null) {
        try {
          setValueState(JSON.parse(e.newValue) as T);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [fullKey]);

  return [value, setValue] as const;
}

/**
 * Persisted boolean state for single collapsible sections/banners/panels.
 * Defaults to `false` (collapsed first).
 */
export function usePersistedOpen(key: string, defaultOpen = false) {
  const fullKey = `${PREFIX}open:${key}`;
  const [isOpen, setIsOpenState] = useState<boolean>(() =>
    safeReadStorage<boolean>(fullKey, defaultOpen),
  );

  const setIsOpen = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      setIsOpenState(prev => {
        const next = typeof updater === 'function' ? (updater as (p: boolean) => boolean)(prev) : updater;
        safeWriteStorage(fullKey, next);
        return next;
      });
    },
    [fullKey],
  );

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, [setIsOpen]);

  return [isOpen, setIsOpen, toggle] as const;
}

/**
 * Persisted Record<string, boolean> state for trees, accordion lists, and expandable cards.
 * Defaults to `{}` (all collapsed on first visit).
 */
export function usePersistedExpandMap(key: string, defaultMap: Record<string, boolean> = {}) {
  const fullKey = `${PREFIX}map:${key}`;
  const [map, setMapState] = useState<Record<string, boolean>>(() =>
    safeReadStorage<Record<string, boolean>>(fullKey, defaultMap),
  );

  const setMap = useCallback(
    (
      updater:
        | Record<string, boolean>
        | ((prev: Record<string, boolean>) => Record<string, boolean>),
    ) => {
      setMapState(prev => {
        const next =
          typeof updater === 'function'
            ? (updater as (p: Record<string, boolean>) => Record<string, boolean>)(prev)
            : updater;
        safeWriteStorage(fullKey, next);
        return next;
      });
    },
    [fullKey],
  );

  const isExpanded = useCallback((id: string) => Boolean(map[id]), [map]);

  const toggle = useCallback(
    (id: string) => {
      setMap(prev => ({ ...prev, [id]: !prev[id] }));
    },
    [setMap],
  );

  const setExpanded = useCallback(
    (id: string, open: boolean) => {
      setMap(prev => ({ ...prev, [id]: open }));
    },
    [setMap],
  );

  const expandAll = useCallback(
    (ids: string[]) => {
      setMap(prev => {
        const next = { ...prev };
        for (const id of ids) {
          next[id] = true;
        }
        return next;
      });
    },
    [setMap],
  );

  const collapseAll = useCallback(() => {
    setMap({});
  }, [setMap]);

  const expandedCount = useCallback(
    (ids?: string[]) => {
      if (!ids) return Object.values(map).filter(Boolean).length;
      return ids.filter(id => Boolean(map[id])).length;
    },
    [map],
  );

  return {
    map,
    setMap,
    isExpanded,
    toggle,
    setExpanded,
    expandAll,
    collapseAll,
    expandedCount,
  };
}

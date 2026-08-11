type CacheEntry<T> = {
  value: T;
  savedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

function storageKey(key: string): string {
  return `nexus-cache:${key}`;
}

function readStorage<T>(key: string): CacheEntry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, entry: CacheEntry<T>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Ignore quota and privacy-mode failures.
  }
}

export function readCachedValue<T>(key: string, maxAgeMs: number): T | null {
  const memory = memoryCache.get(key) as CacheEntry<T> | undefined;
  const entry = memory ?? readStorage<T>(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > maxAgeMs) return null;
  if (!memory) memoryCache.set(key, entry);
  return entry.value;
}

export function writeCachedValue<T>(key: string, value: T): void {
  const entry: CacheEntry<T> = { value, savedAt: Date.now() };
  memoryCache.set(key, entry);
  writeStorage(key, entry);
}


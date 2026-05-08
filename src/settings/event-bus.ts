type CoreCb = (key: string, value: unknown) => void;
type ExtCb = (key: string, value: unknown) => void;

const coreSubs = new Set<CoreCb>();
const extSubs = new Map<string, Set<ExtCb>>();

export function emitCoreChange(key: string, value: unknown): void {
  for (const cb of coreSubs) {
    try {
      cb(key, value);
    } catch (e) {
      console.warn("[settings-bus] core subscriber threw:", e);
    }
  }
}

export function emitExtChange(extId: string, key: string, value: unknown): void {
  const set = extSubs.get(extId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(key, value);
    } catch (e) {
      console.warn("[settings-bus] ext subscriber threw:", e);
    }
  }
}

export function onCoreChange(cb: CoreCb): () => void {
  coreSubs.add(cb);
  return () => coreSubs.delete(cb);
}

export function onExtChange(extId: string, cb: ExtCb): () => void {
  let set = extSubs.get(extId);
  if (!set) {
    set = new Set();
    extSubs.set(extId, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) extSubs.delete(extId);
  };
}

export function _resetForTests(): void {
  coreSubs.clear();
  extSubs.clear();
}

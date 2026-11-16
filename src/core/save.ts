export interface Meta {
  souls: number;
  upg: { vit: number; atk: number; trank: number };
  ranger: boolean;
  best: number;
  daily: { date: number; best: number };
}

const KEY = 'glutgruft.v1';

export function defaultMeta(): Meta {
  return { souls: 0, upg: { vit: 0, atk: 0, trank: 0 }, ranger: false, best: 0, daily: { date: 0, best: 0 } };
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMeta();
    const d = defaultMeta();
    const m = JSON.parse(raw);
    return { ...d, ...m, upg: { ...d.upg, ...(m.upg || {}) }, daily: { ...d.daily, ...(m.daily || {}) } };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(m: Meta): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* Speicher gesperrt */ }
}

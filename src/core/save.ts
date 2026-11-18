export interface Meta {
  souls: number;
  upg: Record<string, number>;
  ranger: boolean;
  best: number;
  daily: { date: number; best: number };
  tree: Record<string, string[]>; // je Klasse: im Lager freigeschaltete Knoten des Fertigkeitsbaums
  tut: string[];    // Lehrgang: erledigte Schritte und gezeigte Karten
  tutOff: boolean;  // Lehrgang ausgeschaltet
}

const KEY = 'glutgruft.v1';

export function defaultMeta(): Meta {
  return { souls: 0, upg: { vit: 0, atk: 0, trank: 0, fokus: 0, gold: 0, bombe: 0, fund: 0, wahl: 0, erbe: 0 }, ranger: false, best: 0, daily: { date: 0, best: 0 }, tree: { krieger: [], magier: [], waldlaeufer: [] }, tut: [], tutOff: false };
}

// Ältere Stände ohne neue Felder bekommen die Vorgaben
export function parseMeta(raw: string): Meta {
  const d = defaultMeta();
  const m = JSON.parse(raw);
  return { ...d, ...m, upg: { ...d.upg, ...(m.upg || {}) }, daily: { ...d.daily, ...(m.daily || {}) }, tree: { ...d.tree, ...(m.tree || {}) },
    // Wer schon gespielt hat, bekommt den Lehrgang nicht ungefragt
    tut: m.tut ?? [], tutOff: m.tutOff ?? (m.best ?? 0) > 0 };
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMeta();
    return parseMeta(raw);
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(m: Meta): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* Speicher gesperrt */ }
}

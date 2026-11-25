// Angriffswarnung für die Darstellung: kann dieser Gegner im nächsten Gegnerzug treffen?
// Nur lesend – keine Zufallszahlen, keine Änderungen an Lauf, Gegnern oder Held.
import { los } from '../game/dungeon';
import { MOBS } from '../game/content';
import type { Run, Actor } from '../game/run';

export type Threat = 'melee' | 'shot' | null;

export function threatOf(run: Run, m: Actor): Threat {
  const p = run.p;
  if (!m.awake || m.st.stun || run.mode !== 'play') return null;
  const d = MOBS[m.kind], man = Math.abs(p.x - m.x) + Math.abs(p.y - m.y);
  if (man === 1) return d.ai === 'slow' && m.cd ? null : 'melee'; // Golem holt aus
  const shot = !!d.range && Math.max(Math.abs(p.x - m.x), Math.abs(p.y - m.y)) <= d.range && los(run.tiles, m.x, m.y, p.x, p.y);
  return shot ? 'shot' : null;
}

// Welche Statusanzeigen eine Figur bekommt (Reihenfolge = Zeichenreihenfolge). Nur lesend.
export type Mark = 'stun' | 'brand' | 'gift' | 'sproede' | 'wall' | 'dodge' | 'netz' | 'mark' | 'schwach';
export function statusMarks(a: Actor, isPlayer: boolean): Mark[] {
  const st = a.st, out: Mark[] = [];
  if (st.stun) out.push('stun');
  if (st.brand) out.push('brand');
  if (st.gift) out.push('gift');
  if (st.sproede) out.push('sproede');
  if (st.netz) out.push('netz');
  if (st.mark) out.push('mark');
  if (st.schwach) out.push('schwach');
  if (isPlayer && st.wall) out.push('wall');
  if (isPlayer && st.dodge) out.push('dodge');
  return out;
}

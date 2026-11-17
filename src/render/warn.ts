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

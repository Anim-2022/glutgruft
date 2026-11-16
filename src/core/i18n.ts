// Sprachen. Der Quelltext ist deutsch; Englisch entsteht beim Zeichnen:
// erst wird der ganze Satz nachgeschlagen, sonst werden bekannte Bausteine ersetzt
// (längste zuerst). So bleiben auch zusammengesetzte Meldungen übersetzbar.
export type Lang = 'de' | 'en';
const KEY = 'glutgruft.sprache';
let lang: Lang = 'de';
try { if (localStorage.getItem(KEY) === 'en') lang = 'en'; } catch { /* kein Speicher */ }

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  cache.clear();
  try { localStorage.setItem(KEY, l); } catch { /* egal */ }
}

const EN: Record<string, string> = {
  // Klassen
  'Krieger': 'Warrior', 'Magier': 'Mage', 'Waldläufer': 'Ranger',
  'Zäher Nahkämpfer. Wut entsteht durch Treffer und Schmerz.': 'Tough melee fighter. Rage builds from hits dealt and taken.',
  'Zerbrechlich, aber verheerend. Mana kehrt langsam von selbst zurück.': 'Fragile but devastating. Mana slowly returns on its own.',
  'Schütze mit Fallen. Fokus wächst beim Warten und mit jedem besiegten Gegner.': 'Archer with traps. Focus grows while waiting and with every kill.',
  'Wut': 'Rage', 'Fokus': 'Focus',
  'Schildstoß': 'Shield Bash', 'Schaden + betäubt 2 Züge': 'Damage + stuns for 2 turns',
  'Wirbelschlag': 'Whirlwind', 'Trifft alle Gegner ringsum': 'Hits every enemy around you',
  'Kriegsschrei': 'War Cry', '+3 Angriff für 6 Züge': '+3 attack for 6 turns', 'Kriegsschrei!': 'War cry!',
  'Funke': 'Spark', 'Feuerball': 'Fireball', 'Explosion + Brand': 'Explosion + burning',
  'Friert Gegner in der Nähe ein': 'Freezes nearby enemies',
  'Blinzeln': 'Blink', 'Teleport weg von Gefahr': 'Teleport away from danger',
  'Schuss': 'Shot', 'Zielschuss': 'Aimed Shot', 'Schwerer Schuss auf große Distanz': 'Heavy shot at long range',
  'Legt eine Falle: Schaden + Betäubung': 'Places a trap: damage + stun',
  'Ausweichrolle': 'Dodge Roll', '2 Felder rollen, weicht Angriffen aus': 'Roll 2 tiles and evade attacks',
  // Gegner
  'Gruftratte': 'Crypt Rat', 'Skelett': 'Skeleton', 'Knochenschütze': 'Bone Archer', 'Fledermaus': 'Bat', 'Sporling': 'Sporeling',
  'Steingolem': 'Stone Golem', 'Glutgeist': 'Ember Wisp', 'Gruftkönig': 'Crypt King', 'Sporenmutter': 'Spore Mother', 'Schmiedefürst': 'Forge Lord',
  'Elite-': 'Elite ',
  // Biome
  'Glutschmiede': 'Ember Forge', 'Pilzhöhle': 'Fungal Cave', 'Gruft': 'Crypt',
  // Gaben
  'Zäh': 'Tough', '+6 max. Leben, heilt 6': '+6 max health, heals 6',
  'Scharfe Klinge': 'Sharp Blade', 'Gepanzert': 'Armored', 'Blutdurst': 'Bloodthirst', 'Heilt 2 pro besiegtem Gegner': 'Heals 2 per kill',
  'Präzision': 'Precision', '+12 % kritische Treffer': '+12 % critical hits',
  'Tiefe Quelle': 'Deep Well', '+3 max. Klassenressource': '+3 max class resource',
  'Meisterschaft': 'Mastery', 'Fähigkeiten +25 % Schaden': 'Skills deal +25 % damage',
  'Vorrat': 'Supplies', '+2 Heiltränke': '+2 healing potions',
  'Dornen': 'Thorns', 'Nahkämpfer erleiden 2 Schaden': 'Melee attackers take 2 damage',
  'Seelenfänger': 'Soul Catcher', '+50 % Seelensplitter': '+50 % soul shards',
  // Verbesserungen
  'Vitalität': 'Vitality', '+2 Leben pro Stufe': '+2 health per rank', 'Schleifstein': 'Whetstone', '+1 Angriff pro Stufe': '+1 attack per rank',
  'Proviant': 'Provisions', '+1 Heiltrank zum Start': '+1 starting potion',
  // Reliquien
  'Glutherz': 'Ember Heart', 'Brand heilt dich, statt zu schaden': 'Burning heals you instead of hurting',
  'Donnerfaust': 'Thunder Fist', 'Jeder 5. Treffer trifft auch alle Gegner daneben': 'Every 5th hit also strikes all adjacent enemies',
  'Pulverhaut': 'Powder Skin', 'Explosionen verletzen dich nicht': 'Explosions do not hurt you',
  'Sprengmeister': 'Demolitionist', '+1 Bombe auf jeder neuen Ebene': '+1 bomb on every new floor',
  'Geisterlicht': 'Ghost Light', 'Du siehst 3 Felder weiter': 'You see 3 tiles farther',
  'Steinhaut': 'Stone Skin', 'Jeder Treffer gegen dich: 1 Schaden weniger': 'Every hit against you deals 1 less damage',
  'Blutpakt': 'Blood Pact', '+4 Angriff, aber -8 max. Leben': '+4 attack, but -8 max health',
  'Seelenkelch': 'Soul Chalice', 'Heiltränke heilen vollständig': 'Potions heal you fully',
  'Zeitsand': 'Sands of Time', 'Gegner verlieren manchmal ihren Zug': 'Enemies sometimes lose their turn',
  'Giftzahn': 'Venom Fang', 'Deine Treffer vergiften': 'Your hits poison',
  'Frostkern': 'Frost Core', 'Betäubungen halten 1 Zug länger': 'Stuns last 1 turn longer',
  'Glücksmünze': 'Lucky Coin', 'Truhen geben doppelte Beute': 'Chests give double loot',
  'Eisenwille': 'Iron Will', 'Überlebe einmal pro Ebene einen tödlichen Treffer': 'Survive one lethal hit per floor',
  'Riesentöter': 'Giant Slayer', '+50 % Schaden gegen Bosse': '+50 % damage against bosses',
  'Fähigkeiten kosten 1 weniger': 'Skills cost 1 less',
  // Ausrüstung
  'Gewöhnlich': 'Common', 'Selten': 'Rare', 'Episch': 'Epic', 'Legendär': 'Legendary',
  'Eisenklinge': 'Iron Blade', 'Stahlklinge': 'Steel Blade', 'Runenklinge': 'Rune Blade', 'Glutklinge': 'Ember Blade',
  'Eichenstab': 'Oak Staff', 'Kristallstab': 'Crystal Staff', 'Runenstab': 'Rune Staff', 'Glutstab': 'Ember Staff',
  'Eschenbogen': 'Ash Bow', 'Stahlbogen': 'Steel Bow', 'Runenbogen': 'Rune Bow', 'Glutbogen': 'Ember Bow',
  'Lederrüstung': 'Leather Armor', 'Kettenhemd': 'Chain Mail', 'Runenpanzer': 'Rune Plate', 'Glutpanzer': 'Ember Plate',
  'Kupferamulett': 'Copper Amulet', 'Silberamulett': 'Silver Amulet', 'Runenamulett': 'Rune Amulet', 'Glutamulett': 'Ember Amulet',
  ' Angriff': ' attack', ' Vert.': ' def.', ' Leben': ' health', ' % Krit': ' % crit', ', verflucht': ', cursed', ' · verflucht': ' · cursed',
  ' angelegt.': ' equipped.', ' abgelegt.': ' unequipped.', ' – im Rucksack [I].': ' – in backpack [I].',
  ' – Rucksack voll, für ': ' – backpack full, sold for ', ' Gold verkauft.': ' gold.', ' für ': ' for ',
  'Der Rucksack ist voll.': 'The backpack is full.',
  'Verfluchte Truhe': 'Cursed chest', 'Händler': 'Trader', 'Truhe': 'Chest',
  // Meldungen
  'Das Rätsel ist gelöst!': 'The puzzle is solved!',
  'Rätsel: Schiebe jede Kiste auf eine Platte. Der Hebel setzt zurück.': 'Puzzle: push every crate onto a plate. The lever resets.',
  'Rätsel: Auf dem Eis rutschst du. Erreiche die leuchtende Platte.': 'Puzzle: you slide on ice. Reach the glowing plate.',
  'Prüfung: Betritt die Platte in der Mitte – und besiege alle in kurzer Zeit.': 'Trial: step on the plate in the middle – and defeat everyone in time.',
  'Rätsel: Betritt die Runen in der richtigen Reihenfolge. Eine Tafel kennt sie.': 'Puzzle: step on the runes in the right order. A tablet knows it.',
  'Die Prüfung beginnt! Besiege alle in 22 Zügen.': 'The trial begins! Defeat everyone within 22 turns.',
  ' leuchtet auf.': ' lights up.', 'Sonne': 'Sun', 'Mond': 'Moon', 'Stern': 'Star', 'Auge': 'Eye',
  'Falsch! Die Runen zerfallen zu Staub.': 'Wrong! The runes crumble to dust.',
  'Falsch! Die Runen erlöschen – und die ganze Ebene erwacht.': 'Wrong! The runes go dark – and the whole floor wakes up.',
  'Das Rätsel ist bereits gelöst.': 'The puzzle is already solved.',
  'Der Hebel klemmt, solange Gegner im Raum sind.': 'The lever is stuck while enemies are in the room.',
  'Die Kisten rumpeln zurück an ihren Platz.': 'The crates rumble back into place.',
  'Etwas Mächtiges lauert hier ...': 'Something mighty lurks here ...',
  'Die Wand bricht ein!': 'The wall collapses!', 'Eine Säule stürzt ein!': 'A pillar collapses!',
  'Eisenwille hält dich am Leben!': 'Iron Will keeps you alive!', 'Du bist gefallen.': 'You have fallen.',
  ' ist besiegt!': ' is defeated!',
  ' lässt einen Schlüssel und einen Heiltrank fallen.': ' drops a key and a healing potion.',
  ' lässt einen Heiltrank fallen.': ' drops a healing potion.',
  ' erreicht!': ' reached!', 'Reliquie: ': 'Relic: ', 'Neue Gabe: ': 'New boon: ',
  'Truhe: ein Heiltrank.': 'Chest: a healing potion.', 'Truhe: zwei Bomben.': 'Chest: two bombs.',
  'Nicht genug ': 'Not enough ', 'Kein Ziel in Reichweite.': 'No target in range.',
  'Hier liegt schon eine Falle.': 'There is already a trap here.', 'Kein Platz zum Rollen.': 'No room to roll.',
  'Dafür reicht dein Gold nicht.': 'You cannot afford that.',
  'Du trinkst aus dem Brunnen. Er versiegt.': 'You drink from the fountain. It runs dry.',
  'Der Schlüssel passt. Das Gitter öffnet sich.': 'The key fits. The gate opens.',
  'Ein verschlossenes Gitter. Ein Elitegegner auf dieser Ebene trägt den Schlüssel.': 'A locked gate. An elite enemy on this floor carries the key.',
  'Händler: "Sieh dich um, Wanderer."': 'Trader: "Have a look around, wanderer."',
  'Die Wand ist rissig – sie gibt nach.': 'The wall is cracked – it gives way.', 'Noch ein Schlag ...': 'One more blow ...',
  'Die Kiste lässt sich so nicht schieben.': 'The crate cannot be pushed that way.',
  'Die Tafel zeigt: ': 'The tablet shows: ', 'Die Tafel ist verwittert.': 'The tablet is weathered.',
  'Die Lunte brennt – weg hier!': 'The fuse is lit – get away!',
  'Du bist zu schwach für das Opfer.': 'You are too weak for the sacrifice.',
  'Der Altar nimmt ': 'The altar takes ', ' Leben und gewährt eine Gabe.': ' health and grants a boon.',
  'Eine Treppe nach unten. [E] zum Abstieg.': 'Stairs leading down. [E] to descend.',
  'Der Boden knackt unter dir ...': 'The floor cracks beneath you ...', 'Der Boden bricht ein!': 'The floor gives way!',
  'Keine Heiltränke mehr.': 'No healing potions left.', 'Du bist bereits bei voller Gesundheit.': 'You are already at full health.',
  'Keine Bomben mehr.': 'No bombs left.', ' tritt in die Falle!': ' steps into the trap!', ' ruft Verstärkung!': ' calls for reinforcements!',
  'Die Zeit ist um – die Prüfung ist gescheitert.': 'Time is up – the trial has failed.',
  // Oberfläche im Lauf
  'Fernangriff, ': 'Ranged attack, ', ' Felder. Kostet nichts.': ' tiles. Costs nothing.', '. Kostet ': '. Costs ',
  'Heiltrank': 'Healing Potion', 'Heilt einen großen Teil deines Lebens, löscht Gift und Brand.': 'Restores a large part of your health and cures poison and burning.',
  'Heilt einen großen Teil deines Lebens': 'Restores a large part of your health',
  'Bombe': 'Bomb', 'Sprengt Gegner, rissige Wände und Säulen. Halte Abstand.': 'Blasts enemies, cracked walls and pillars. Keep your distance.',
  'Sprengt Gegner, Wände und Säulen': 'Blasts enemies, walls and pillars',
  'Brand ': 'Burn ', 'Gift ': 'Poison ', 'Ausweichen ': 'Dodging ', 'Kriegsschrei ': 'War Cry ',
  'Stufe ': 'Level ', 'Prüfung: noch ': 'Trial: ', ' Züge': ' turns', 'Ebene ': 'Floor ', 'Angriff ': 'Attack ', 'Vert. ': 'Def. ',
  'RUCKSACK': 'BACKPACK', 'Leben': 'Health', 'Angriff': 'Attack', 'Verteidigung': 'Defense', 'Kritisch': 'Critical',
  ' Gold': ' gold', 'ANGELEGT': 'EQUIPPED', 'Waffe': 'Weapon', 'Rüstung': 'Armor', 'Amulett': 'Amulet', 'leer': 'empty',
  'Im Rucksack: ': 'In backpack: ', 'Leer. Truhen und Händler füllen ihn.': 'Empty. Chests and traders fill it.',
  'Ersetzt: ': 'Replaces: ', 'Dieser Platz ist noch frei.': 'This slot is still free.',
  '[ENTER] anlegen · [X] verkaufen (': '[ENTER] equip · [X] sell (', '[ENTER] ablegen': '[ENTER] unequip',
  'Pfeile: wählen · [I] oder [ESC] schließen': 'Arrows: select · [I] or [ESC] close',
  '   Zug ': '   Turn ', 'Fähigkeiten': 'Skills', 'Besiegt': 'Kills', 'Seelensplitter': 'Soul shards',
  'AUSRÜSTUNG': 'EQUIPMENT', 'RELIQUIEN': 'RELICS', 'Noch keine – löse Rätselkammern.': 'None yet – solve puzzle chambers.',
  'GABEN': 'BOONS', 'Noch keine – steige eine Stufe auf.': 'None yet – gain a level.',
  '[C] oder [ESC] schließen': '[C] or [ESC] close', '[H] oder [ESC] schließen': '[H] or [ESC] close',
  'Pfeile / WASD': 'Arrows / WASD', 'bewegen, in Gegner laufen greift an': 'move; walk into enemies to attack',
  'Leertaste': 'Space', 'einen Zug warten': 'wait one turn', 'Fernangriff (Magier, Waldläufer)': 'ranged attack (Mage, Ranger)',
  'Heiltrank trinken': 'drink a healing potion', 'Bombe werfen': 'throw a bomb', 'Treppe hinabsteigen': 'descend the stairs',
  'Klick / Tab': 'Click / Tab', 'Ziel wählen': 'choose a target', 'Maus': 'Mouse', 'über etwas halten zeigt Details': 'hover over things for details',
  'Rucksack: Ausrüstung wechseln, verkaufen': 'backpack: swap and sell equipment', 'Charakter, Reliquien, Gaben': 'character, relics, boons',
  'Minikarte ein/aus': 'toggle minimap', 'Ton ein/aus': 'toggle sound', 'Vollbild': 'Fullscreen', 'diese Hilfe': 'this help',
  'STEUERUNG': 'CONTROLS',
  'Treppe nach unten [E]': 'Stairs down [E]', 'Verfluchte Truhe – stark, aber kostet Leben': 'Cursed chest – strong, but costs health',
  'Händler – hineinlaufen zum Handeln': 'Trader – walk into him to trade', 'Brunnen – heilt einmal': 'Fountain – heals once',
  'Versiegter Brunnen': 'Dry fountain', 'Gitter – der Schlüssel liegt bei einem Elitegegner': 'Gate – an elite enemy holds the key',
  'Altar: Leben gegen eine Gabe': 'Altar: health for a boon', 'Rissige Wand – 3 Schläge oder Bombe': 'Cracked wall – 3 blows or a bomb',
  'Fass – anstoßen zündet die Lunte': 'Barrel – bump it to light the fuse', 'Säule – stürzt bei Explosion ein': 'Pillar – collapses when blasted',
  'Bewuchs – brennbar': 'Overgrowth – flammable', 'Brüchiger Boden': 'Brittle floor',
  'Brüchiger Boden – bricht beim nächsten Tritt': 'Brittle floor – breaks on the next step', 'Kiste – schiebbar': 'Crate – pushable',
  'Kiste auf Platte': 'Crate on plate', 'Druckplatte': 'Pressure plate', 'Hebel – setzt die Kisten zurück': 'Lever – resets the crates',
  'Eis – du rutschst': 'Ice – you slide', 'Steintafel': 'Stone tablet', 'Zielplatte': 'Goal plate', 'Feuer': 'Fire',
  'Fernkampf ': 'Ranged ', 'giftig': 'poisonous', 'entzündet': 'ignites', 'langsam': 'slow', 'unberechenbar': 'erratic',
  'betäubt': 'stunned', 'brennt': 'burning', 'vergiftet': 'poisoned', 'schläft': 'asleep',
  'Pfeiltasten oder WASD: bewegen': 'Arrow keys or WASD: move', '[E] steigt die Treppe hinab': '[E] descends the stairs',
  '[Q] trinkt einen Heiltrank': '[Q] drinks a healing potion',
  '[F] schießt auf den nächsten Gegner · [1]–[3] Fähigkeiten': '[F] shoots the nearest enemy · [1]–[3] skills',
  'In einen Gegner laufen greift an · [1]–[3] Fähigkeiten': 'Walk into an enemy to attack · [1]–[3] skills',
  'Rissige Wand: dreimal dagegenlaufen oder [B] Bombe': 'Cracked wall: walk into it three times or [B] bomb',
  'Fass: anstoßen zündet die Lunte – dann Abstand halten': 'Barrel: bump it to light the fuse – then keep away',
  'Truhe: hineinlaufen öffnet sie': 'Chest: walk into it to open', 'Finde die Treppe · Maus über etwas halten zeigt Details': 'Find the stairs · hover over things for details',
  'WÄHLE EINE RELIQUIE': 'CHOOSE A RELIC', 'WÄHLE EINE GABE': 'CHOOSE A BOON', 'Taste 1 oder 2': 'Press 1 or 2', 'Taste 1, 2 oder 3': 'Press 1, 2 or 3',
  'HÄNDLER': 'TRADER', ' – verkauft': ' – sold', '[LEERTASTE] weiterziehen': '[SPACE] move on',
  'SIEG!': 'VICTORY!', 'GEFALLEN': 'FALLEN', 'Die Glutgruft ist bezwungen.': 'The Ember Crypt is conquered.',
  'Besiegte Gegner: ': 'Enemies defeated: ', 'Stufe: ': 'Level: ', '[LEERTASTE] zurück zum Lager': '[SPACE] back to camp',
  // Menüs
  'Diese Klasse ist noch gesperrt.': 'This class is still locked.', 'Ton an': 'Sound on', 'Ton aus': 'Sound off',
  'Lauf beendet – Splitter gutgeschrieben.': 'Run ended – shards credited.', 'Waldläufer freigeschaltet!': 'Ranger unlocked!',
  'Nicht genug Seelensplitter.': 'Not enough soul shards.', 'Bereits auf höchster Stufe.': 'Already at the highest rank.',
  'Ein Abstieg in fünfzehn Ebenen': 'A descent through fifteen floors',
  'LAGER': 'CAMP', 'Gruft bezwungen': 'Crypt conquered', 'Tiefste Ebene: ': 'Deepest floor: ', 'Fernkampf': 'Ranged', ' Felder': ' tiles',
  'GESPERRT': 'LOCKED', '[ENTER] freischalten: ': '[ENTER] unlock: ', ' Splitter': ' shards', 'VERBESSERUNGEN': 'UPGRADES',
  'Tageslauf': 'Daily run', 'Heute für alle dieselbe Gruft': 'The same crypt for everyone today', 'offen': 'open', 'bezwungen': 'conquered',
  'FORTSETZEN · EBENE ': 'CONTINUE · FLOOR ', 'ABSTIEG BEGINNEN': 'BEGIN DESCENT', 'X: gespeicherten Lauf beenden': 'X: end the saved run',
  'Pfeile: wählen · ENTER: kaufen/bestätigen · LEERTASTE: Abstieg · V: Vollbild · M: Ton': 'Arrows: select · ENTER: buy/confirm · SPACE: descend · V: fullscreen · M: sound',
  'L: Sprache · ESC: Titel': 'L: language · ESC: title',
  'SPIEL STARTEN': 'START GAME', 'SPRACHE: DEUTSCH': 'LANGUAGE: ENGLISH', 'TON: AN': 'SOUND: ON', 'TON: AUS': 'SOUND: OFF', 'VOLLBILD': 'FULLSCREEN',
  'Pfeile wählen · ENTER bestätigen': 'Arrows select · ENTER confirm',
  'Bewegen: Pfeile/WASD · Fähigkeiten: 1-3 · Rucksack: I · Hilfe: H': 'Move: arrows/WASD · Skills: 1-3 · Backpack: I · Help: H',
};

const exact = new Map(Object.entries(EN));
// Bausteine für zusammengesetzte Texte: nur ab vier Zeichen, längste zuerst
const parts = Object.entries(EN).filter(([k]) => k.length >= 3).sort((a, b) => b[0].length - a[0].length);
const cache = new Map<string, string>();

export function tr(s: string): string {
  if (lang === 'de' || !s) return s;
  const hit = exact.get(s) ?? cache.get(s);
  if (hit !== undefined) return hit;
  let out = s;
  for (const [de, en] of parts) if (out.includes(de)) out = out.split(de).join(en);
  if (cache.size > 2000) cache.clear();
  cache.set(s, out);
  return out;
}

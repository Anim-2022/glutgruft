# Glutgruft

Rundenbasiertes Pixel-Roguelike für den Browser. Keine Installation, kein Konto, Spielstand im Browser.

## Entwicklung

```bash
npm install
npm run dev      # lokaler Server
npm test         # Logiktests
npm run build    # Ausgabe in dist/
```

## Deployment (Vercel)

Build-Befehl `npm run build`, Ausgabeverzeichnis `dist`.

## Steuerung

Pfeile/WASD bewegen und angreifen · Leertaste warten · 1–6 Fähigkeiten (4–6: Zauber aus dem Baum) · U Ultimative · 7–0 Rollen und Tränke · K Fertigkeitsbaum · F Fernangriff · Q Heiltrank · B Bombe · E Treppe
Klick oder Tab wählt ein Ziel · I Rucksack · C Charakter · H Hilfe · N Minikarte · M Ton · V Vollbild · L Sprache (DE/EN)

## Inhalt

- 15 Ebenen in drei Biomen, Boss auf jeder fünften Ebene, drei Klassen
- zerstörbare Umgebung: rissige Wände, Fässer, Säulen, brüchiger Boden, Feuer
- Rätselkammern (Kisten, Runen, Eishalle, Kampfprüfung) mit Reliquien als Lohn
- Händler, Gold, Ausrüstung in vier Seltenheiten, verfluchte Truhen
- dauerhafte Verbesserungen im Lager, Tageslauf, automatisches Speichern

`tests/bot.ts` enthält einen Autospieler; `npm test` gibt aus, wie weit er je Klasse kommt.

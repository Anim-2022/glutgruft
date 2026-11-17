# Asset-Pipeline: KI-Bild → Sprite

Kurzfassung: **16×16 = Autokonvertierung als Entwurf, danach von Hand säubern. 24×24 (Bosse) = Bild nur als Referenz, Matrix von Hand zeichnen.**

## 1. Bild erzeugen (Z-Image-Turbo)

Space `mcp-tools/Z-Image-Turbo`, Auflösung `1024x1024 ( 1:1 )`, `random_seed: false`, Seed notieren.

Prompt-Vorlage:

```
16x16 pixel art sprite of {Gegnerbeschreibung} with a {Erkennungsfarbe}, chunky large pixels, big head,
front view, no outline, flat solid black background, centered, retro game, very low resolution,
each pixel clearly visible, limited 8-color palette
```

Beispiel: `{Gegnerbeschreibung}` = `a skeleton archer`, `{Erkennungsfarbe}` = `red hood`.

- Erscheint statt des Bildes eine Tafel „maybe not safe“ (Safety-Filter): **anderen Seed** nehmen. Derselbe Seed liefert immer wieder die Tafel.
- Das Modell hält sich nicht an „16x16“: die Figur ist im Bild ~45–55 „Pixel“ breit. Deshalb gibt es immer Verluste beim Verkleinern.

## 2. Konvertieren

WebP aus dem Tool erst verlustfrei als PNG speichern, dann:

```bash
node scripts/img2sprite.ts assets/_hf_test/<bild>.png --size 16 --name <sprite_name>
```

```bash
node scripts/img2sprite.ts assets/_hf_test/<bild>.png --size 16 --grid --name <sprite_name>
```

Empfohlen: beide Modi laufen lassen und die bessere Vorschau als Startpunkt nehmen. Standardwerte reichen meist.

| Flag | Standard | Wann ändern |
|---|---|---|
| `--size` | 16 | 24 für Bosse (nur zum Vergleich, siehe oben) |
| `--tol` | 12 | Hintergrund bleibt stehen → erhöhen; Figur wird angefressen → senken |
| `--empty` | 0.5 | dünne Linien fehlen → erhöhen (z. B. 0.65) |
| `--kweight` | 0.3 | Umriss der Vorlage frisst Details → senken |
| `--grid` | aus | Pixelraster der Vorlage erkennen; ohne Treffer automatisch normaler Modus |
| `--global` | aus | Hintergrundfarbe auch innerhalb der Figur entfernen |

Ausgabe: Matrix im Format von `src/render/sprites.ts` (stdout) und Vorschau ×8 `<out>/<bild>[_grid]_preview.png`.
`assets/_hf_test/` ist in `.gitignore` – Test-Bilder werden nicht eingecheckt.

## 3. Von Hand säubern (Pflicht vor dem Einbau)

- **Großer Kopf**: Schädel/Kopf mind. 6–8 px breit, Augen bzw. Augenhöhlen deutlich (2×2).
- **Kein schwarzer Umriss**: `k` nur für Augen, Nase, Schlitze. Den Umriss zeichnet das Spiel selbst (`NO_OUTLINE` beachten).
- **Nur `PAL`**: keine neuen Zeichen ohne Eintrag in `PAL`.
- **Ansicht von vorn**, Waffe wie bei den bestehenden Figuren rechts; Rück- und Seitenansicht (`VIEWS`) von Hand ergänzen.
- Erkennungsfarbe deutlich (z. B. Kapuze `e`/`r` beim Knochenschützen), Einzelpixel-Rauschen entfernen.
- Fertige Matrix gegen die bestehenden Sprites im selben Maßstab prüfen.

## 4. Quellen und Lizenzen

- **Z-Image-Turbo** (`Tongyi-MAI/Z-Image-Turbo`): Apache-2.0 – verwenden.
- **lm555/game-asset-generator**: nicht verwenden. Liefert nur `Error!`, Lizenz nicht angegeben.

Jedes übernommene Sprite in `assets/CREDITS.md` eintragen:

```markdown
## <sprite_name> (src/render/sprites.ts)
- Modell: Tongyi-MAI/Z-Image-Turbo (Space mcp-tools/Z-Image-Turbo), Lizenz Apache-2.0
- Prompt: "<vollständiger Prompt>"
- Seed: <seed>, Auflösung 1024x1024
- Konvertierung: img2sprite --size 16 [--grid], danach von Hand überarbeitet
- Datum: <JJJJ-MM-TT>
```

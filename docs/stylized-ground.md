# Nebeljagd – ruhige Bodenflächen und natürliche Wege

Der vom Nutzer gezeigte Battlerite-Screenshot dient als gestalterische Referenz:
ruhige, zusammenhängende Grünflächen, deutlich erkennbare hellgraue
Steinpflasterwege, erdige Übergänge und dezente Oberflächenstruktur. Es werden
keine fremden Spiel-Assets übernommen.

- Der automatisch erzeugte, dichte **bewegte Wiesengras-Teppich** ist ohne
  explizites `groundCover`-Opt-in abgeschaltet. So entstehen deutlich weniger
  animierte Grasgeometrien auf üblichen Karten und mobilen Geräten.
- Das **mit dem Pinsel platzierte hohe Versteckgras** und die Versteckmechanik
  bleiben vollständig erhalten. Auch bestehende Karten mit ausdrücklich
  aktiviertem dichtem Bodengras bleiben lesbar und funktional.
- Wiese, Wald, Erde, Stein und Pflaster haben gedeckte natürliche Farbtöne.
  Der Bodenpinsel startet mit kontrollierter Randhärte (65 %) und dezenter
  Farbvariation (9 %), die über die vorhandenen Einstellungen editierbar sind.
- Die wiederholte Boden-Canvastextur ist ruhiger; helle Halme und Sprenkel sind
  reduziert. Pflaster erhält wärmere graue Steine über einem dunklen
  erdigen Fugenbild.
- Bereits gezeichnete Wege bekommen über ihren Shader einen schmalen
  erdigen Saum und einen sanften Rand ins Terrain; kein zusätzlicher Weg-Mesh
  und keine teure Echtzeit-Animation werden benötigt.
- Der Editor bietet unter **Malen → Boden** einen direkten Zugang zu
  **Wege zeichnen oder bearbeiten** in den vorhandenen Kartenwerkzeugen.

Der Projektkarten-Datensatz `worldmap.json` wird nicht geändert. Frühere
Browserentwürfe und vorhandene Wegpunkte, Gebäude und Bäume behalten ihre
Positionen. Ein echter Leistungstest auf iPads bleibt erforderlich.

## Wegpinsel und Biomfarben

Unter **Malen → Boden & Wege** stehen acht Wegbeläge zur Wahl: Erdweg,
Waldpfad, Strand-Sandweg, ockerfarbener Wüstenpfad, festgetretener Schnee,
Kies, Schlammpfad und Steinpflaster. **Weg malen** aktiviert den Pinsel mit
2,5 m Radius (5 m Gesamtbreite). Radius und Randhärte lassen sich anschließend
anpassen. Ein Ziehen ist ein rückgängig machbarer Strich. Die Flächen bleiben
im vorhandenen `landscape.terrain`-Format und funktionieren nach JSON-Export,
Import und beim Spielstart aus dem Editor.

Große, deterministische Farbflächen ergänzen die Naturböden: Moos/Oliv/Erde
für grüne Biome, warme Sand-/Ockertöne und kühlere Schneeschatten. Die
Bodenmalerei verwendet dieselben Farbabstufungen. Regionale Farbgrenzen
blenden über weiche 36-m-Schultern; die Höhen- und Kollisionsberechnung
bleibt erhalten. Die kleine gemeinsame Bodentextur zeigt feine mineralische
Flecken statt gezeichneter Halme. Keine zusätzlichen Bodenmeshes oder
animierten Bodeneffekte sind dafür nötig.

Prüfung: `node --test tests/natural_ground.test.js` sowie nach `npm run build`
bei laufendem Preview auf Port 4174 `python3 tests/natural_ground_smoke.py`.
Der Browsertest zeichnet mit Maus und Touch, prüft Undo/Redo und JSON-Rundreise
und startet die gespeicherte Karte über den Editor im Spiel.

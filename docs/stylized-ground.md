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

## Gewählte Variante 2: breite, gebogene Blattbüschel

Das Versteckgras verwendet sieben breite, leicht gefaltete Blätter je Büschel.
Die Spitzen biegen nach außen und etwas nach unten. Unterschiedliche Blatthöhen,
Büschelhöhen und kleine dekorative Randbüschel lösen die frühere Spitzenwand ab.
Der instanzierte Wind verankert weiterhin die Wurzeln und reagiert auf Figuren.
Randbüschel erhalten keinen eigenen Versteckradius; Wege, Gewässer und Gebäude
werden bei ihrer Platzierung ausgespart. Bestehende Kartenobjekte bleiben erhalten.

Die Dichte sinkt von 20 auf 4 Büschel je Radiusquadrat. Ein volles Büschel hat
224 statt 64 Dreiecke; insgesamt sind das bei gleicher Fläche 896 statt 1280
Dreiecke je Radiusquadrat (30 % weniger). Leistungsgeometrie halbiert diese
Werte. Das ist ein Geometrievergleich, keine gemessene iPad-Bildrate.

Bodenfarben entstehen nun aus vielen kleinen, unregelmäßigen Farbflecken in
einer gemeinsamen 512-Pixel-Textur statt dominanten großen Farbwolken.
Wegoberflächen werden unabhängig von der gröberen Pinselmaske im Shader
abgetastet. Der Rand erhält schmale, unregelmäßige Übergänge; Pflaster zeigt
kleinere, gedecktere Steine mit weniger dominanten Fugen. Neue Wegpinsel
verwenden 72 % Randhärte. Kein externes Grafikpaket ist nötig.

`tests/broadleaf_game_smoke.py` prüft den tatsächlichen erzeugten Spielbuild
in beiden Qualitätsstufen: Blattmodell, Randbüschel, Texturbudget, Verstecken
und Verlassen des Bereichs. Aufnahmen liegen in `test-results/broadleaf/`.

## Verfeinerung nach der Spielprüfung: Wiesenhalme, Ähren und Naturwege

Die neue Bildreferenz ersetzt die breiten Rosetten des Versteckgrases durch
14 schmale, gebogene Halme je Büschel. Blattadern und Längsfasern werden im
Material gezeichnet. Nur etwa jedes vierte Büschel trägt eine höhere Ähre;
die Auswahl bleibt beim Wechsel der Grafikqualität stabil. Kleine Randbüschel,
Wind, Figurenkontakt und der gespeicherte Versteckbereich bleiben erhalten.
Die volle Geometrie hat 288 Dreiecke je Büschel, die Leistungsstufe 144.
Es entsteht weiterhin kein flächendeckendes automatisches Bodengras.
Die vorhandenen Sträucher erhalten eine eigene gemalte Blattoberfläche mit
spitzen Blattformen und Adern; ihre Modelle bleiben unverändert.

Der frühere Pflasterpinsel heißt nun „Naturweg · Randsteine“. Alte `cobble`-
Flächen bleiben lesbar und behalten ihren Umriss, zeigen aber eine erdige
Mitte mit vereinzelten verwitterten Steinen am Rand. Auch das gespeicherte
Wegenetz verwendet diese Gestaltung. Die Steine teilen sich eine transparente
512-Pixel-Textur und benötigen keine zusätzlichen Weltobjekte oder Draw Calls.

Die Leuchtkreise unter beiden Truhenmodellen entfallen. Bodenbeute ist visuell
20 % größer, gehaltene Waffen 12 % kleiner; gespeicherte Objektgrößen,
Griffursprünge, Waffendaten und Reichweiten werden nicht umgeschrieben.

Rollen erzeugt im Schnee eine zusammenhängende körperbreite Mulde mit hellen
Pulverschneerändern. Rollen und Gehen teilen denselben begrenzten Instanzpool
und dieselbe Ausblendzeit. Während der Rolle entstehen keine Sohlenabdrücke;
beim anschließenden Gehen setzt der normale Schrittabstand wieder ein.

Prüfung: `npm test`, `npm run build`, `tests/broadleaf_game_smoke.py` (beide
Grafikstufen, Verstecken, Beute und Griffposition), `tests/snow_roll_smoke.py`
(Tastatur und Touch) sowie `tests/online_editor_smoke.py`. Aktuelle Aufnahmen
und Berichte liegen unter `test-results/natural-details/`. Software-WebGL
belegt die Funktion und Darstellung, keine Bildrate auf einem physischen iPad.

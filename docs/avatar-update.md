# Vorheriger neutraler menschlicher Avatar

Dieser Bericht beschreibt den erhaltenen Vorgänger. Der aktive Avatar ist jetzt
die hochgeladene Tripo-GLB; siehe [aktueller Import](tripo-avatar-update.md).

Der damalige neue Abenteurer ersetzt den bisherigen Waldläufer als lokale Spielfigur.
Der Stil verwendet ein modelliertes Gesicht, geschlossene Jacken-/Hosenflächen,
modellierte Haarsträhnen, Hände mit Fingern und geformte Lederstiefel. Es gibt
keine fest eingebaute Waffe oder Klassenrüstung. Die neutralen Kleidungsstücke
bleiben separate Teile für spätere Outfits.

## Dateien und Maßstab

- `assets/characters/adventurer.blend`: Modell, humanoides Rig, drei Actions,
  vollständiger verbundener Körper als ausgeblendete Bearbeitungsvorlage,
  Studio- und Spielwinkelkamera.
- `assets/characters/adventurer.glb`: tatsächliches Browser-Asset; 24.964
  Dreiecke, 22 Gelenke, acht Modellteile, fünf PBR-Materialien, 1,8456 m.
- `scripts/build-avatar.py`: lokale reproduzierbare Erzeugung und Export.
- `assets/characters/adventurer-inspection.json`: Maße, Bone-/Mesh-Namen,
  Clip-Längen, Herkunft und SHA-256.
- `avatar-preview.html`: Ansicht mit Orbit, Nahaufnahme, Spielkamerawinkel,
  Animationsauswahl, Wiedergabe/Anhalten und Zeitlupe; nach dem Build auch als
  vollständig eingebettete HTML unter `dist/` und im ZIP verfügbar.

Vertexfarben ergänzen die geometrischen Falten und Materialtrennung. Es gibt
keinen Texturatlas und keine Abhängigkeit von externen Bilddateien. Die Figur
blickt in glTF nach +Z; +Y ist oben. Der bisherige Gameplay-Skalierungsfaktor
1,2 bleibt erhalten. Das Modell wird für den lokalen Spieler verwendet;
der Stand ist kein neuer Netzwerk- oder Mehrspielermodus.

## Bewegung und Ausrüstung

`Idle_Nebeljagd` (2 s) und `Run_Nebeljagd` (0,6 s) sind Schleifen am Ort.
`Roll_Nebeljagd` (0,8 s in der Datei) enthält das Abtauchen, das Einziehen von
Kopf und Knien, eine volle Vorwärtsrotation um X, Bodenkontakt und Aufstehen.
`src/avatar-animation.js` stimmt diesen Clip auf die vorhandene Spieldauer
von 0,72 s ab. Weltbewegung und Kollisionsbehandlung bleiben in `main.js`.
Eine zweite Drehung oder Verkleinerung der Figur wird nicht hinzugefügt.
Bei einem Richtungswechsel mit sofortiger Rolle richtet sich der Körper an
der tatsächlichen Rollbewegung aus und behält diese Richtung bis zum Ende.

Die vorhandenen Waffengriffe und Arm-IK, die Sicht-/Grasregeln, Schneeeinsenkung
und Schneeverdeckung werden weiterverwendet. Das HUD zeigt ein aus dem echten
Modell gerendertes Porträt und den neutralen Namen „Abenteurer“.

## Prüfung

`npm test` prüft unter anderem die exportierte GLB über Three.js: Geometrie,
normalisierte Gewichte, humanoide Gelenke, Metermaßstab, PBR-Materialien,
Clip-Schleifen und die tatsächliche vollständige Vorwärtsrotation. Die
verformten Meshes werden in den Rollphasen auf Kompaktheit und Bodenkontakt
geprüft. Die Animationstests decken außerdem Übergänge, Zeitablauf, Pause und
Reset ab. `npm run verify:assets` prüft den aktiven Avatar sowie die erhaltenen
historischen Versionen und importierten Umweltassets.

`tests/avatar_smoke.py` testet in Chromium die normale Spielkamera, reale
WASD-Eingabe, Leertaste, Pause mitten in der Rolle, die Bogenaufnahme und einen
Schuss sowie einen abrupten Richtungswechsel vor der Rolle. Bericht und
Bilder liegen unter `docs/avatar-check-*`. Die Abnahme umfasst zusätzlich
Studio-, Kopf-, Rücken-, Spielwinkel-, Lauf- und Rollphasenbilder. Die
Browserprüfung verwendet Software-WebGL und ist kein Leistungsnachweis auf
einem echten iPad. Eine künstlerische Bewertung anhand der mitgelieferten
Nahansicht bleibt sinnvoll; kommerzielles Battlerite-Art-Niveau wird nicht
als Messergebnis behauptet.

Die Arbeit und die erzeugten Dateien werden ausschließlich auf `work`
gespeichert. `main` und die darüber veröffentlichte ältere Website werden
für diesen Auftrag nicht verändert. Der zentrale Browserstand auf `work`
liegt weiterhin unter `welt/`, ergänzt um `welt/avatar-preview.html`.

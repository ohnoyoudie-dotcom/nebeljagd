# Import des hochgeladenen Spieleravatars

Die aktive Spielfigur und die Avatar-Vorschau verwenden jetzt
`assets/characters/nebeljagd_player_base_v1.glb`. Die früheren Figuren
`adventurer.glb` und `ranger.glb` bleiben erhalten, werden aber nicht mehr
als lokale Spielfigur oder in der Vorschau geladen.

## Quelle und Darstellung

Die GLB wurde vom Nutzer bereits animiert und texturiert bereitgestellt.
Generator-Metadatum: Tripo. Es wurde kein Generierungsdienst aufgerufen.
Die Dateien in `assets/characters/` und
`public/assets/characters/player/` sind bytegleich mit dem Upload:

- SHA-256: `29232024a0a1be5b6e8d81cf48b2433d6bbd58ac5b0ccb6c035e6c5acab22624`.
- 10.630.644 Bytes, 20.161 Dreiecke, 66 Skin-Gelenke, ein Mesh und ein Material.
- Drei eingebettete 2048 × 2048 Texturen: Farbe, Normalen, Rauigkeit/Metall.
- Eigene Clips für Stehen, Sprint, Vorwärtsrolle und Niederlage. Die ersten
  drei werden vom bestehenden Spiel verwendet; der Niederlagenclip bleibt erhalten.

Das Modell wird aus der tatsächlichen stehenden Pose vermessen, in einer
äußeren Gruppe auf 1,82 m normalisiert und auf den Boden gesetzt. Der vorhandene
Spielgrößenfaktor 1,2 bleibt bestehen. Texturen und Materialeigenschaften
bleiben erhalten. Die Grafik im HUD stammt aus einer direkten Three.js-Aufnahme
des hochgeladenen Modells (`player-portrait.png`).

## Anpassung an das bestehende Spiel

Die originalen Animationsnamen werden den Rollen Stehen, Laufen und Rollen
zugeordnet. Der Sprint enthält zunächst einen Anlauf. Ein ausgewählter
vollständiger Schrittzyklus wird deshalb für die Dauerschleife verwendet,
damit die Figur beim Rennen nicht immer wieder stehen bleibt. Die bestehende
Rollmechanik spielt den gelieferten Rollclip in 0,72 s ab.

Die Vorwärtsrolle wird auf Bodendurchdringung geprüft und in den vorbereiteten
Animationsdaten nach oben korrigiert, wo das verformte Modell sonst unter
Bodenniveau geraten würde. Die Korrekturen sind in `player-animation-profile.json`
vorberechnet und an den Hash der Quelldatei gebunden. Im Browser werden dafür
keine vollständigen Mesh-Verformungen pro Bild oder beim Start durchgerechnet.
Neuberechnung: `node scripts/build-player-animation-profile.js`. Diese Anpassungen passieren außerhalb der GLB;
Weltbewegung und Kollision bleiben in der Spiellogik.

Vier doppelte Eckpunkte an der rechten Hand sind im Upload vollständig an
`neutral_bone` gebunden. Das erzeugt beim Animieren eine lange schmale Spitze.
Der Import korrigiert ausschließlich diese bekannten Skinning-Gewichte anhand
der direkt angrenzenden Handflächen. Positionen, UVs, Texturen, Dreiecke und
die Quelldatei werden nicht umgebaut. Vorschau und Spiel verwenden dieselbe
Korrektur.

Die Handzuordnung verwendet exakte Mixamo-Knochennamen. Dadurch wird kein
Fingerknochen versehentlich als Handgelenk behandelt. Armlängen für bestehende
Waffenbewegungen werden im normalisierten Maßstab gemessen. Sicht, Versteckgras,
Schnee und die bestehende Steuerung werden weiterverwendet.

## Prüfen und öffnen

```sh
npm test
npm run verify:assets
npm run build
npm run preview -- --port 4174
python tests/avatar_smoke.py
```

Das Spiel liegt nach dem Build unter `dist/nebeljagd.html`, die Nahansicht unter
`dist/avatar-preview.html`. Beide enthalten das komplette Modell samt Texturen.
Die auf `work` gespeicherten Ausgaben stehen unter `welt/`.
`main` und die öffentliche Veröffentlichung dieses Branches werden nicht geändert.

Browserbefunde und echte Spielaufnahmen stehen in `docs/avatar-check-*`.
Chromium/Software-WebGL prüft Darstellung und Funktion; die Leistung auf einem
echten iPad oder mit 50 gleichzeitig sichtbaren neuen Avataren ist damit nicht gemessen.

## Ergebnis dieses Imports

- 162 Node-Tests bestanden, einschließlich tatsächlicher GLB-Verformung,
  Laufschleife, Rollkontakt und der begrenzten Handkorrektur.
- Asset-Prüfung und Browser-Build bestanden. Die unveränderte hochgeladene GLB
  wurde in beiden fertigen HTML-Dateien bytegenau nachgewiesen.
- Fünf Spielprüfungen im fertigen Build bestanden: Darstellung, WASD/Stand,
  Rolle/Pause, vorhandener Bogen und Richtungswechsel vor der Rolle.
- Fünf Vorschauprüfungen bestanden: Modell/Maßstab, Lauf, Rolle,
  Zeitlupe/Wiederholung und mobile Bedienung bei 390 Pixel Breite.
- Keine JavaScript- oder Konsolenfehler in diesen beiden Browserprüfungen.
- Die bestehende Welt-/Editorprüfung bestanden: Vegetation, Sicht/Schatten,
  Schnee einschließlich Einsinken der neuen Figur und direktes Speichern im Editor.
  Der Test wartet nach Ortswechseln auf eine aktualisierte Szene, bevor er
  Vegetationswerte prüft.

Die ZIP-Datei enthält Spiel, Editor und die neue Avatar-Vorschau; ihre
Integrität wurde geprüft.

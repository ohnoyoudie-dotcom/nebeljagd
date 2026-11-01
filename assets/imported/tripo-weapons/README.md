# Tripo-Waffen für Nebeljagd

Die drei Original-GLBs in `assets/inbox/` bleiben unverändert. Dieses lokale,
quellenerhaltende Paket stellt getrennte Browser-Ableitungen bereit.

## Koordinatenvertrag

Die Längsachse zeigt in glTF nach **+Y** zur Klinge/zum Kristall. **+Z** bleibt
die Vorderseite der Quelltextur. Die Präsentationsneigung der Quellen wurde
starr korrigiert. Der Ursprung **(0,0,0)** liegt im sichtbaren Griffzentrum,
nicht an der Unterkante. Für schwebende Bodenobjekte bei Bedarf die in
`inspections/` dokumentierten Grenzen nutzen; gehaltene Waffen direkt am
Griff ausrichten. Alle Koordinaten sind Meter. Schwertlänge 1,25 m,
Stablängen jeweils 1,70 m. `tipPoint` dokumentiert den tatsächlichen obersten
Vertex, `gltfBounds` die Grenzen nach Vereinfachung.

## Prüfung und Reproduktion

`previews/` enthält echte Blender-Renderings der normalisierten Quellgeometrie
und des Browsermodells mit identischer Kamera/Beleuchtung. Keine Textur wurde
erfunden: Base Color, Metallic/Roughness, Normal Map und UVs bleiben erhalten;
Base Color/Metallic-Roughness werden auf 1024 Pixel, die verlustfrei gespeicherten
Normal-Maps auf 768 Pixel verkleinert. Kleine
Positionsduplikate/degenerierte Flächen werden vor der Vereinfachung bereinigt.

`blender -b -t 3 --python scripts/prepare-tripo-weapons.py`

Einzelmodell: `-- --only sword` (auch `lava-staff`, `crystal-staff`).
Paket/Thumbnails aus vorhandenen Prüfberichten neu schreiben: `-- --package-only`.
Blender 4.3.2 sowie lokales `python3` mit Pillow wurden verwendet.

## Provenienz

Vom Projektinhaber bereitgestellte Tripo-Modelle; Einbindung ausdrücklich
beauftragt. Kein kostenpflichtiger Anbieteraufruf und kein separat mitgelieferter
kommerzieller Lizenzbeleg. Dies ist kein kanonisches `game-dev`-CLI-Paket;
die zusätzliche CLI stand in der Arbeitsumgebung nicht zur Verfügung.
SHA-256-Werte, ursprüngliche und reduzierte Dreieckzahlen, Texturen und statische
Prüfungen sind in `inspections/`, `inspection.json`, `provenance.json` dokumentiert.
`runtime-manifest.json` enthält den geschlossenen Dateibestand dieses lokalen Pakets.
WebGL, Editor, Ausrüstung und künstlerische Freigabe werden separat geprüft.

| Modell | B × H × T (m) | Dreiecke | GLB (kB) | Unterkante Y | Spitze Y |
| --- | --- | ---: | ---: | ---: | ---: |
| Tripo-Schwert | 0.394 × 1.250 × 0.150 | 11,999 | 1358 | -0.187 | 1.063 |
| Tripo-Lavastab | 0.410 × 1.699 × 0.415 | 12,000 | 1263 | -0.345 | 1.355 |
| Tripo-Kristallstab | 0.324 × 1.701 × 0.294 | 12,000 | 1404 | -0.354 | 1.347 |

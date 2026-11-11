# Baumstümpfe, liegende Stämme und Holzkisten

Die sechs Originale in `assets/inbox/` bleiben unverändert. `runtime/` enthält
separate Browser-GLBs in Metern, mit +Y oben, horizontal zentriert und auf Y=0.
Die liegenden Stämme behalten ihre ursprüngliche Ausrichtung entlang Z.
Originale Materialien, UVs und eingebettete PBR-Texturen bleiben erhalten;
Farbtexturen werden auf 384 Pixel, Normalen auf 256 Pixel und Rauheit/Metall
auf 128 Pixel reduziert (JPEG, Qualität 85, volle Farbkanäle). Geometrie wird
auf 6–8k Dreiecke reduziert. So bleiben die eigenständigen
HTML-Dateien und das Offline-ZIP unter GitHubs Dateigrößengrenze.

Reproduktion: `blender -b -t 3 --python scripts/prepare-tripo-woodland.py`.
Die Aufbereitung verwendet `scripts/prepare-tripo-props.py` als gemeinsame Basis.
`inspections/` dokumentiert Maße, Budgets und SHA-256-Werte. `previews/` zeigt
Original und Browserkopie mit gleicher Kamera und Beleuchtung.
Die Editor-Vorschauen werden separat aus den tatsächlichen Spielmodellen erzeugt.

Vom Projektinhaber bereitgestellte Modelle, Einbau ausdrücklich beauftragt.
Kein Anbieteraufruf. Ein separater kommerzieller Lizenzbeleg liegt nicht bei.
Dies ist das bestehende lokale Projektformat, kein Game-Dev-CLI-Paket.

| Modell | Originaldatei | Maße B × H × T (m) | Dreiecke | GLB (kB) |
| --- | --- | --- | ---: | ---: |
| Baumstumpf 1 | tree stump 3d model.glb | 1.57 × 0.80 × 1.52 | 8000 | 310 |
| Baumstumpf 2 | tree stump 3d model (1).glb | 1.36 × 1.05 × 1.35 | 7999 | 338 |
| Liegender Stamm 1 | wood log 3d model.glb | 0.99 × 1.00 × 3.19 | 7997 | 360 |
| Liegender Stamm 2 | wooden log 3d model.glb | 0.96 × 1.32 × 3.00 | 7999 | 362 |
| Holzkiste 1 | wooden crate 3d model.glb | 1.15 × 0.95 × 1.15 | 6000 | 387 |
| Holzkiste 2 | wooden crate 3d model (1).glb | 1.40 × 0.64 × 1.07 | 6000 | 372 |

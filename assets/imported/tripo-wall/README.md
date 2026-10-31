# Verwitterte Tripo-Steinmauer

Original: `assets/inbox/stone wall 3d model.glb` bleibt unverändert.
Spielmodell: `runtime/wall.glb`, lokale X-Achse als Wiederholrichtung, +Y oben,
auf Y=0 geerdet und horizontal zentriert. Originale Proportionen und PBR-Texturen
bleiben erhalten; Farbe/Rauheit maximal 2048², Normalen 1536², Geometrie 12000 Dreiecke.
Maße B × H × T: 6.000 × 1.174 × 0.877 Meter.
Dateigröße: 3944784 Bytes.

Reproduktion: `blender -b -t 3 --python scripts/prepare-tripo-wall.py`.
`inspection.json` dokumentiert Quell- und Zieldatei, Messwerte, SHA-256 und Budgetprüfungen.
`previews/` enthält echte Blender-Renderings bei gleicher Kamera/Beleuchtung.

Vom Projektinhaber bereitgestellter Tripo-Export, Einbindung ausdrücklich beauftragt.
Kein kostenpflichtiger Anbieteraufruf; separater kommerzieller Lizenzbeleg nicht mitgeliefert.
Dieses lokale Projektpaket ist kein `game-dev`-CLI-Beleg (CLI nicht vorhanden).
GPU-Import, Kollisionsverhalten und menschliche Freigabe werden separat geprüft.

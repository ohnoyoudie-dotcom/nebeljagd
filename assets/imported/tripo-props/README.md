# Tripo-Gegenstände für Nebeljagd

Originale: `assets/inbox/`. Die hochgeladenen GLBs bleiben unverändert.
Ableitungen: `runtime/`, normale glTF-Meterkoordinaten (+Y oben, +Z vorne),
horizontal zentriert und auf Y=0 geerdet. Ursprungsausrichtung bleibt erhalten.

`inspections/` enthält gemessene Maße, Höhenbänder, Dreieckzahlen, Texturgrößen,
SHA-256-Werte und statische Prüfungen je Modell. `previews/` enthält echte
Blender-Renderings vor und nach der Optimierung unter gleicher Kamera/Beleuchtung.
Es werden keine Texturen oder neuen Modelle erzeugt. Die UVs und PBR-Texturen
der Originale werden beibehalten; Texturen sind auf maximal 1024² reduziert.
Submillimetergroße Positionsduplikate und degenerierte Flächen werden vor der
Vereinfachung bereinigt; die UVs je Flächenecke bleiben erhalten.

Reproduktion: `blender -b -t 3 --python scripts/prepare-tripo-props.py`.
Einzelmodell: nach dem Skriptpfad `-- --only wagon` (oder barrel, well,
rock-01, rock-02, rock-03) ergänzen.

Provenienz: vom Projektinhaber bereitgestellte Tripo-Modelle, Einbindung ausdrücklich
beauftragt. Kein kostenpflichtiger Anbieteraufruf; kein separater kommerzieller
Lizenzbeleg mitgeliefert. Dieses lokale Paket ist kein `game-dev`-CLI-Beleg
(CLI in der Arbeitsumgebung nicht vorhanden). WebGL, Kollisionen und Editor
werden unabhängig von den hier dokumentierten Blender-/Dateiprüfungen getestet.

| Modell | Maße B × H × T (m) | Dreiecke | GLB (kB) |
| --- | --- | ---: | ---: |
| Holzfass | 0.86 × 0.95 × 0.91 | 8,000 | 547 |
| Flacher Felsen | 2.00 × 0.57 × 1.72 | 4,000 | 495 |
| Findling | 1.86 × 1.31 × 2.20 | 4,999 | 515 |
| Hoher Felsen | 2.35 × 2.55 × 2.60 | 6,999 | 492 |
| Holzkarren | 1.62 × 1.09 × 2.90 | 13,999 | 836 |
| Steinbrunnen | 2.25 × 2.40 × 1.82 | 13,994 | 822 |

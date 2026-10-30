# Neues Tripo-Gasthaus

Aufbereitete, dachlose Variante der vom Nutzer gelieferten Datei
`assets/inbox/medieval tavern interior 3d model.glb` für einen Test im Karteneditor.
Das Original bleibt unverändert im Eingang. Keine erneute Erzeugung bei Tripo.

## Dateien und Maße

- `runtime/tavern.glb`: 100.000 Dreiecke, ein Mesh und ein Material, drei
  eingebettete Texturen mit jeweils 2048 × 2048 Pixeln, etwa 7,05 MB.
- Ursprungsdatei: 1.860.045 Dreiecke, Texturen mit 4096 × 4096 Pixeln,
  etwa 65,44 MB. Der Detailverlust wurde anhand der beiliegenden Ansichten
  geprüft; UVs und Materialzuordnung bleiben erhalten.
- Breite ca. 22 m, Tiefe ca. 17,77 m. glTF: Y oben, +Z vorn, +X rechts.
  Die ursprüngliche Ausrichtung bleibt erhalten.
- Median des zentralen Fußbodens liegt nach dem Höhenversatz bei Y=0.
  Der generierte Holzboden ist leicht uneben (an den gemessenen Hallenpunkten
  ungefähr −0,013 bis +0,097 m). Eine Spielfigur benötigt einen dazu passend
  gewählten Laufboden; dies ist keine begehbare Dreiecksoberfläche.
- Fundament reicht bis etwa Y=−0,888 m, höchster Punkt bis Y=4,754 m.

## Nachvollziehbarkeit und Prüfung

`inspection.json` hält Quell- und Laufzeit-Hashes, Maße, Dreieckszahlen,
Texturänderungen und den Höhenversatz fest. `runtime-manifest.json` enthält
den Hash-Katalog der aufbereiteten Dateien und referenziert das Original.
`previews/` enthält dieselben Ansichten vor und nach der Reduktion.

`previews/collision-sections.png` zeigt echte horizontale Schnitte der Laufzeit-
Geometrie bei 0,6, 1,6 und 2,5 m. Die Grafik dient ausschließlich
als metrische Grundlage für manuell passende Kollisionen. Sie ist kein
fertiges Kollisionsmodell. Türen sind echte Lücken unter ihren Stürzen.
Die vollständigen Rohsegmente sind vorübergehend unter
`/tmp/nebeljagd-tripo-tavern-collision-sections.json` gespeichert und werden
vom Aufbereitungsskript erneut erzeugt.

Reproduzierbare Geometrieaufbereitung aus dem Repository-Hauptverzeichnis:

```sh
blender -b -t 4 --python scripts/prepare-tripo-tavern.py
```

Das Skript schreibt die abgeleiteten Dateien dieses Pakets und temporäre
Geometrie-Schnittdaten unter `/tmp/`.
Es skaliert einheitlich, verschiebt den Median des Hallenbodens auf Y=0,
reduziert die vorhandene Geometrie mit Blenders Collapse-Decimate und
verkleinert die vorhandenen Texturen. Es verändert das Original nicht.
Verwendet wurde Blender 4.3.2. Der `game-dev`-CLI war in der Arbeitsumgebung
nicht installiert; dies ist ein lokal dokumentiertes Projektpaket, kein
durch die Studio-CLI erzeugter Admission-Receipt.

Herkunft: vom Nutzer bereitgestellter Tripo-Export, für diesen Editor-Test
ausdrücklich zur Integration beauftragt. Ein separater Nachweis des
Tripo-Tarifs bzw. kommerzieller Provider-Rechte wurde nicht mitgeliefert.

Die Prüfung hier umfasst GLB-Struktur, eingebettete Dateien, Zahlenwerte,
Hashes und Blender-Render. Laufzeit- und Kollisionsprüfungen im Spiel werden
separat durch die Editor-Integration dokumentiert.

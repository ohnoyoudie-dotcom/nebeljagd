# Kleines Tripo-Schloss

Aufbereitete dachlose Version des vorhandenen Nutzer-Exports
**assets/inbox/castle interior 3d model.glb**. Das Original bleibt unverändert.
Dies ist das kleinere Schloss mit zentralem Saal und vier Seitenräumen,
nicht der spätere Entwurf des großen Gartenschlosses.

## Laufzeitdatei

- **runtime/castle.glb:** 179.999 Dreiecke, ein Mesh und ein Material,
  14.013.992 Bytes. Alle Texturen sind eingebettet.
- Basisfarbe: 4096 × 4096 Pixel. Normal- und Metall/Rauheitstextur:
  jeweils 2048 × 2048 Pixel.
- Original: 1.916.390 Dreiecke, drei 4096 × 4096 Texturen, 68.252.420 Bytes.
- Einheitlich auf etwa 70 m Breite skaliert; tatsächliche Tiefe etwa 48,60 m.
  glTF-Koordinaten: Y oben, +Z vorne, +X rechts.
- Median von neun zentralen Hallen-Bodenproben auf Y=0 verschoben.
  Fundament bis etwa Y=−1,608 m, höchster Punkt Y=9,051 m.

Der originale Tripo-Boden hatte im zentralen Eingangsbereich eine etwa 1,28 m
tiefe Rinne. Die abgeleitete Laufzeitversion hebt nur diese nach oben gerichteten
Bodenflächen innerhalb X=−5…5 m, Z=8…24,5 m auf den Hallenboden an. 2.039
Quellvertices wurden vor der Reduktion verschoben; UVs, Fundamentunterseite
und Portale bleiben erhalten. Der Originalexport wurde nicht verändert.

Die nachgemessene Portal-Mittellinie liegt jetzt von Z=16 bis 24 m bei Y≈0
(statt vorher etwa −1,28 m). Freie Seitenböden und Westtür bleiben unverändert.
Kleines Mosaikrelief und das Thronpodium sind weiterhin vorhanden. Für das
Spiel ist ein passender Laufboden-Proxy vorgesehen; die Figuren laufen nicht
automatisch auf der vollständigen Dreiecksoberfläche. Die gemessenen Werte
vor und nach der Reparatur stehen in floor-before-repair.json,
floor-after-repair.json und floor-validation.json.

## Architektur und Prüfung

Die vorhandene Einrichtung ist Teil des zusammengefügten Meshes. Einzelne Möbel
sind hier nicht als getrennte zerstörbare Objekte aufbereitet.
Die Aufbereitung verändert weder Raumaufteilung noch Tore.
In den gemessenen Schnitten sind ein südlicher Haupteingang und eine westliche
Außentür erkennbar. Die östliche Außenwand ist im gelieferten Mesh geschlossen.
Die Zugänge einer früheren Bildvorlage dürfen deshalb nicht ungeprüft als
Durchgänge im Spiel eingetragen werden.

**previews/** enthält gleiche orthografische und perspektivische Ansichten vor
und nach der Reduktion. Der visuelle Vergleich bestätigt, dass die wesentliche
Architektur, Einrichtung, Materialfarben und Bodenmuster erhalten sind.
Die Schnittgrafik zeigt tatsächliche horizontale Mesh-Schnitte bei 0,6, 1,6 und
2,5 m Höhe. Sie ist eine Grundlage zur Collider-Erstellung, kein Collider-Modell.
Die Rohsegmente werden unter **/tmp/nebeljagd-tripo-castle-collision-sections.json**
neu erzeugt.

## Reproduzieren und Herkunft

Aus dem Repository-Verzeichnis ausführen:

    blender -b -t 4 --python scripts/prepare-tripo-castle.py

Blender 4.3.2: einheitliche Skalierung, Hallenboden-Höhenversatz,
Begrenzte Eingangs-Bodenreparatur, Collapse-Decimate mit UV-Erhalt,
Verkleinerung vorhandener Normal-/RM-Texturen.
Keine neuen Texturen, kein Remeshing, keine erneute Tripo-Erzeugung.
Das Skript schreibt nur abgeleitete Paketdateien und temporäre Schnittdaten.

**inspection.json**, **provenance.json** und **runtime-manifest.json** dokumentieren
Hashes, Maße, Quellen, Texturen, Dreieckszahlen und die erhaltenen Originalbytes.
Der game-dev-CLI ist in dieser Umgebung nicht installiert; dies ist ein lokal
dokumentiertes Projektpaket nach dem vorhandenen Nebeljagd-Verfahren, kein
Studio-CLI-Admission-Receipt.

Herkunft: vom Nutzer bereitgestellter Tripo-Export, dessen Integration ausdrücklich
beauftragt wurde. Ein separater kommerzieller Provider-Nachweis wurde nicht
mitgeliefert. Diese Aufbereitung umfasst statische Dateiprüfung und Blender-
Vorschauen; Browserdarstellung, Spielkollisionen und endgültige künstlerische
Freigabe werden separat durch die Integration geprüft.

# Sternstab und Mondprojektil aus der Inbox

Die beiden vom Benutzer bereitgestellten Tripo-Modelle wurden lokal geprüft,
für den Browser abgeleitet und mit tatsächlichen Blender-PBR-Bildern verglichen.
Die Originale in `assets/inbox/` bleiben bytegleich erhalten.

| Verwendung | Original | Ableitung | Dreiecke | GLB-Größe |
| --- | --- | --- | ---: | ---: |
| Sternstab | `arcane star staff 3d model.glb` | `tripo-star-moon/runtime/star-staff.glb` | 11.999 | 881.048 Byte |
| Projektil des Mondstabs | `crescent moon prop 3d model.glb` | `tripo-star-moon/runtime/moon-crescent.glb` | 6.000 | 613.004 Byte |

Der Sternstab zeigt den goldenen Sternkopf mit blauem Kristall und den violett
umwickelten Griff. Sein Ursprung liegt im Griff; glTF **+Y** zeigt zur Spitze.
Die gemessene Länge beträgt etwa 1,70 m. Der tatsächliche oberste Punkt ist in
`inspections/star-staff.json` als `normalization.tipPoint` gespeichert.

Die silberne Mondsichel zeigt die Gravuren und den violetten Innenrand des
Originals. Ihr Ursprung liegt in der Mitte; die Silhouette liegt in **XY**,
die Vorderseite zeigt nach **+Z**. Sie misst etwa 1,126 × 1,200 × 0,293 m.
Für den horizontalen Rückkehrflug wird sie um −π/2 um X gedreht. Die bisherige
Flug- und Trefferlogik wird getrennt von diesem Modell geprüft.

Beide Dateien enthalten UV-Koordinaten, Normalen und drei eingebettete
PBR-Texturen, ohne externe Ressourcen oder erforderliche Decoder. Beim
Sternstab wurden die Farb-/Materialtexturen auf 768 px und die Normalmap auf
512 px begrenzt. Die Sichel verwendet 512 px; ihre Tangenten-Normalmap wurde
vom unveränderten Originalskulpt auf die vereinfachte Geometrie gebacken.
So bleiben die Metalloberfläche und Gravuren bei 6.000 Dreiecken besser erhalten.

Die zusammen 1.494.052 Byte großen Browsermodelle und die geschlossene
SHA-256-Dateiliste liegen unter `assets/imported/tripo-star-moon/`.
`scripts/prepare-tripo-star-moon.py` beschreibt die reproduzierbare lokale
Vorbereitung. Quellhashes, Materialkanäle, Geometrie, Texturbudgets und
Dateiintegrität sind geprüft. Die Gegenüberstellung liegt in
`assets/imported/tripo-star-moon/previews/comparison.png`.

Es wurden keine Anbieterjobs gestartet und keine Originale ersetzt. Die
optionale `game-dev`-CLI ist in dieser Umgebung nicht installiert; deshalb
wurde die vorhandene Blender-Pipeline des Projekts verwendet. Das Paket ist
als lokales Projektpaket gekennzeichnet, nicht als kanonischer CLI-Beleg oder
unabhängiger Nachweis kommerzieller Lizenzrechte. Editor- und Spieltests
erfolgen anschließend mit der tatsächlich erzeugten Browserfassung.

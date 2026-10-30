# Drei Kisten für Nebeljagd

Drei separate Bildvorlagen für Tripo im Stil des aktuellen Avatars, der Truhe
und des Fasses:

1. `crate-square-closed`: quadratische geschlossene Kiste, flache Oberseite.
2. `crate-long-closed`: längliche Transportkiste, flache Oberseite.
3. `crate-open-empty`: offene, leere Vorratskiste mit sichtbarem Innenraum.

Jeweils **ein Bild einzeln** in Tripo verwenden. Eine Dreier-Collage würde eher
ein zusammenhängendes Modell als drei unabhängig nutzbare Kisten ergeben.
Die erzeugten Modelle als GLB mit Materialien herunterladen und anschließend
unter `assets/inbox/` ablegen. Eindeutige Namen verwenden, zum Beispiel
`crate-square-closed.glb`, `crate-long-closed.glb` und `crate-open-empty.glb`.

Die Bilder sind Vorlagen, keine geprüften Spielmodelle. Bei der offenen Kiste
nach der Generierung besonders kontrollieren, ob Innenraum und Innenboden
wirklich modelliert wurden. Geschlossene Kisten benötigen ebene Deckflächen;
keine Beschläge sollten oberhalb der Aufsetzfläche schweben oder hervorstehen.
Exakte Größen, Ursprung am Boden, Kollisionskörper, Texturen und Modellbudget
werden nach der Generierung geprüft und bei Bedarf in Blender aufbereitet.
Die Stapelfunktion im Editor ist ein späterer eigener Entwicklungsschritt.

Die exakten Bildprompts einschließlich Ausschlüssen liegen in den drei
Unterordnern. `provenance.json` hält Stilreferenzen und Herkunft fest.

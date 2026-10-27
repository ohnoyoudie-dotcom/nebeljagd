# Gemalter Boden in der vorhandenen Spielwelt

Die neun Bodenarten stehen im gemeinsamen Datenkatalog `src/map/landscape.js`:
Wiese, Waldboden, Erde, Sand, Schlamm, Stein, Fels, Schnee und Pflaster. Ein
Pinselstrich speichert normale, geordnete Flächen unter `landscape.terrain`.
Jede Fläche trägt Position, Radius, Farbe, Deckkraft, Randhärte, Farbvariation
und einen reproduzierbaren Zufallswert. Die alte Karte benötigt dieses Feld
nicht; ohne Bodenmalerei entstehen weder zusätzliche Texturen noch Änderungen
an der bisherigen Geländegeometrie.

`src/map/terrain-paint.js` enthält die reine Farbberechnung. Ein räumlicher
32-Meter-Index begrenzt die betrachteten Flächen. Später gemalte Schichten
überdecken frühere, weiche Ränder verlaufen leicht unregelmäßig. Die Berechnung
endet früh, sobald jüngere Schichten ältere vollständig verdecken. Diese
Farbberechnung steht dem SVG-Editor und der Vegetation zur Verfügung. Die
Grundfarbe unter angepasstem Gras kommt aus `spatial.colorAt()` einschließlich
der Bodenmalerei. Beim erneuten Teststart aus dem Editor werden die aktuellen
Farben übernommen. Die Texturtransparenz von Vegetation wird nicht verändert.

## Darstellung und begrenzte Kosten

Die vorhandenen Terrain-Dreiecke, ihre Höhen und ihre Abschnittsaufteilung
bleiben bestehen. Ein ergänzter Materialshader mischt den gemalten Boden ein;
ein Pinselpunkt erzeugt weder ein eigenes Mesh noch einen zusätzlichen Draw
Call. Wege, Wasser, Holzbrücken und Hausböden bleiben ihre vorhandenen separaten
Oberflächen. Gemalter Schnee oder Stein hebt den Boden deshalb nicht an und
verändert auch keine Bewegungs- oder Geschosskollisionen.

Nur sichtbare, tatsächlich bemalte Geländeabschnitte bekommen kleine lokale
Farbtexturen. Nicht mehr sichtbare Texturen werden freigegeben. Die tatsächlichen
Vertex-Grenzen jedes Abschnitts bestimmen den Ausschnitt; dadurch werden
Pinselkreise nicht an den Grenzen ihrer nominellen 64-Meter-Zelle abgeschnitten.
Farbe und Materialdetails verwenden durchgehend Weltkoordinaten.

Die Texturgrößen sind auf 256 Pixel in der Leistungsstufe und 512 Pixel in der
hohen Stufe begrenzt. Die residenten Farb- und Pflastermaskendaten zusammen sind
auf 16 beziehungsweise 32 MiB begrenzt. Das ist ein Budget für diese gemalten
Texturdaten, kein Versprechen über den gesamten GPU-Speicherverbrauch. Texturen
werden ohne Mipmaps mit linearer Filterung erstellt. Die Pflastermaske verwendet
zusätzlich die bestehende gemeinsame Steintextur, damit einzelne Steine auch
in der Leistungsstufe scharf bleiben.

Neu benötigte Abschnitte werden nach Nähe sortiert und über mehrere Bilder
aufgebaut: höchstens zwei pro Bild, mit einer weichen Zeitgrenze von sechs
Millisekunden. Ein einzelner Abschnitt wird zusammenhängend berechnet und kann
diese Zeitgrenze überschreiten. Solange er vorbereitet wird, bleibt darunter
der bisherige Boden sichtbar. Sehr kleine harte Pinselränder werden in der
Leistungsstufe entsprechend ihrer niedrigeren Texturauflösung weicher.

## Prüfung

`tests/landscape_terrain.test.js` prüft Randverläufe, Schichtreihenfolge, alle
neun Bodenarten, kleine Flächen, geteilte Bodenfarbberechnung und die
Texturauflösungs-/Speichergrenzen. Die bisherigen Küsten-, Fluss-, Brücken-
und Hausprüfungen bleiben unverändert erfolgreich.

`tests/landscape_terrain_smoke.py` importiert sechs Bodenflächen in die echte
Spielseite, überprüft die ursprünglichen 4.020 Weltobjekte und dieselbe Anzahl
Terrain-Dreiecke, reist zu einer entfernten bemalten Stelle und lädt den
gespeicherten Import erneut. Bericht: `landscape-terrain-check.json`.
Die Aufnahmen und Zeitwerte verwenden Chromium mit SwiftShader auf der
Cloud-CPU. Sie belegen Funktion und Datenbudgets, keine iPad-Bildrate. Reale
Safari-/iPad-Messungen stehen weiterhin aus.

# Vom Nutzer hochgeladene Rei-Assets

Die vier Dateien wurden vom Nutzer für den Einbau in Nebeljagd bereitgestellt.
Ihre unveränderten Bytes liegen unter `source/`; `source-manifest.json` enthält
Dateigrößen und SHA-256-Werte. Es wurde kein Lizenz- oder Urheberrechtsnachweis
beigefügt. Diese Integration behauptet deshalb weder eine eigenständige öffentliche
Lizenz noch, dass die hochgeladenen Modelle vom Nebeljagd-Projekt erstellt wurden.

## Gezielt verwendete Bestandteile

- `Rei_treeLeavesGN.glb`: ein Baum am westlichen Gartenrand von Mooswinkel,
  ungefähr bei **(-24,5; 8,6)**, auf 5,8 Welteinheiten Höhe skaliert.
- `Rei_treeLeavesGN_samples.glb`: ein zweiter Baum nördlich des Seitengartens
  bei **(-25; -15,6)** und zwei kleine Sträucher. Die Demoanordnung, Hilfsblätter
  und Wind-Empty werden nicht als komplette Spielszene importiert.
- `Rei_flowersGN_sample.blend`: drei echte Blumenprototypen aus den bereitgestellten
  Geometry Nodes. Daraus werden **24 Blumen** auf zwei kleinen Beeten instanziert:
  am gut sichtbaren Pfadrand bei **(-7,5; 12,8)** und neben der Gartenmauer bei
  **(-23,3; 6,2)**. Originale Blütenfarben bleiben als Vertexfarben erhalten.
- `grassGN3_3_v2_Rei.glb`: diese Datei enthält einen Testwürfel und eine Bodenplane,
  aber **keine exportierten Grashalme**. Nur die Bodenplane wird als kleiner,
  weich begrenzter Beetuntergrund genutzt. Das ist kein Import des ursprünglichen
  Geometry-Nodes-Graseffekts; die vorhandenen spielbaren Grasflächen bleiben separat.

Die Stammkollisionen der zwei importierten Bäume werden anhand der normalisierten
Stammursprünge platziert, nicht pauschal im Mittelpunkt der Baumkrone. Blumen und
kleine Sträucher sind begehbare Dekoration. Spawn, Waffen, Hauseingänge und der
nahe Kristall bleiben frei. Die Reservierungsfunktion hält zufällige Bäume/Felsen
von diesen gezielten Plätzen fern.

## Bearbeitung und Laufzeit

`geometry-inspection.json` dokumentiert die Originalauswahl, Maße, normalisierten
Stammursprünge und GLB-Prüfsummen. Die Baumtopologie bleibt erhalten; der kleinere
Busch wurde aus dem Original abgeleitet und für seine kleine Spielansicht reduziert.
Der Blumenbericht beschreibt das Realisieren der GN-Instanzen, die Palette und die
optimierten Prototypen. Die Bearbeitung überschreibt keine Originaldatei.

In den Baum-GLBs fehlen exportierte Texturen, Vertexfarben und der originale
Blender-Shader-Look. `src/imported-garden.js` weist deshalb eigene, lokal gezeichnete
Laub-/Borkenmaterialien zu. Das erhält die gelieferten Formen, rekonstruiert aber
nicht den fehlenden originalen Geometry-Nodes-Blatteffekt. Auch die weiche
Erdoberfläche der Beete ist ein neues Nebeljagd-Laufzeitmaterial.

Die ausgewählten GLBs werden durch Vite in die Browserdatei eingebettet. Es werden
keine externen Grafikdienste, Schlüssel oder Texturdownloads benötigt. Der Import
nutzt wenige gezielte Exemplare und drei instanzierte Blumengruppen, statt die
gesamten Demo-Szenen oder große Streuflächen zu rendern.

Der gezielte Aufbau umfasst 2 Bäume, 2 begehbare Sträucher, 24 Blumen und 2
Beetgrundflächen. Er benötigt 13 Basis-Zeichnungen und etwa 73.756 eingereichte
Dreiecke vor zusätzlichen Schattenpassagen. Die niedrige Grafikstufe lässt
Blumen-/Strauchschatten weg. Dies ist eine kleine bewusst platzierte Sammlung,
kein großflächiger Ersatz der bisherigen Vegetation.

Ein isolierter WebGL-Import mit der tatsächlichen Weltskalierung 0,84 wurde
geprüft: alle fünf GLBs laden, die Instanzen stehen am Boden, Blumenfarben sind
erhalten und es treten keine JavaScript-/Shaderfehler auf. Der anschließende
Welt-Browsertest prüft die Stammkollisionen und die begehbaren Wege gemeinsam mit
dem restlichen Spiel; der isolierte Import allein ist kein iPad-Leistungsbeleg.

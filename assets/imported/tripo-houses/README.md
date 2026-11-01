# Tripo-Wohnhaus 2

Dieses Paket enthält das tatsächlich hochgeladene, texturierte Modell
`assets/inbox/medieval house interior 3d model 2.glb`. Der Benutzer hat die
Auswahl auf **Modell 2** beschränkt; es wird kein Haus 1 ergänzt oder aus einem
anderen Export abgeleitet.

- Editorvariante: `house:kit-tripo-house-02` / **Wohnhaus 2 · Tripo**
- Laufzeitmodell: `runtime/house-02.glb`
- Grundfläche: ungefähr **22 × 22 Meter**, damit die Breite zum vorhandenen
  Tripo-Wirtshaus passt. Die ursprünglichen Proportionen bleiben erhalten.
- 100.000 Dreiecke; drei eingebettete PBR-Texturen mit 2048 × 2048 Pixeln.
- Originalexport unverändert; keine Tripo-Neugenerierung oder Ersatztextur.

Die Höhenunterschiede der begehbaren Bodenflächen sind in der Spielversion
angeglichen. Im ursprünglichen Mesh lag der Wohnraumboden stellenweise ungefähr
16 cm höher als die übrigen Räume. Eine streng ansteigende Höhenabbildung
komprimiert den Bodenbereich von −20 bis +25 cm auf −2 bis +2,5 cm und geht
außerhalb von −35 bis +60 cm unverändert in das Original über. Dadurch behalten
dünne Bodenschichten ihre Reihenfolge; es entstehen keine deckungsgleichen
Flächen. UV-Koordinaten und Texturen bleiben erhalten. Scheitelpunkte außerhalb
dieses niedrigen Bereichs werden nicht verändert. Die Spielfigur sinkt so im
Wohnraum nicht mehr in den Boden ein.

Das Haus besitzt einen großen Wohnraum, ein Schlafzimmer und eine Küche.
Der mittige Eingang vorne sowie der schmale Küchenausgang hinten sind im
Mesh tatsächlich unter ihren Türstürzen geöffnet. Die zwei inneren Durchgänge
bleiben frei. Möbel sind Teil des verbundenen Originalmodells und nicht
einzeln zerstörbar oder verschiebbar.

`src/map/tripo-house-definitions.js` enthält die anhand der Schnittbilder
gemessenen Mauern, Möbelkollisionen, Bodenmaße und reproduzierbare Testrouten.
Die Gebäudehülle und großen Möbel blockieren Bewegung und Geschosse.

## Nachweise

- `inspections/house-02.json`: Quell- und Laufzeitdaten, Maße und statische
  Prüfung von UV-Koordinaten, PBR-Texturen, Dreiecken und Dateigröße.
- `previews/house-02-source-*.png` und `house-02-runtime-*.png`: echte
  Blender-Ansichten vor und nach der Aufbereitung, keine Konzeptbilder.
- `previews/house-02-collision-sections.png`: horizontale Schnitte durch das
  tatsächliche Laufzeitmodell bei 0,5 / 1,2 / 2,5 Metern.
- `floor-and-openings-validation.json`: direkte Strahltests durch die echten
  Türöffnungen und Raumzugänge des erneut importierten Laufzeit-GLB, ergänzt
  durch Bodenmessungen nach der Angleichung.
- `provenance.json` und `runtime-manifest.json`: Herkunft und Dateiprüfsummen.

Die kommerzielle Tripo-Lizenzquittung wurde nicht mitgeliefert. Dieses Paket
dokumentiert die vom Nutzer beauftragte Verwendung seiner Projektdatei,
ohne eine unabhängige Lizenzprüfung zu behaupten.

Erneut erzeugen:

Benötigt Blender sowie `python3` mit Matplotlib für das Schnittdiagramm.

```sh
blender -b -t 4 --python scripts/prepare-tripo-houses.py -- --only house-02
```

Danach die Ansichten und die Kollisionen erneut prüfen. Die Dateiprüfungen
ersetzen weder einen Browserimport noch die menschliche Freigabe des Aussehens.

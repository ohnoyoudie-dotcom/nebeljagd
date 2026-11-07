# Bäume im Nebeljagd-Online-Map-Editor

**Aktueller Stand:** Die vorherigen vier Baumvarianten Grüne Eiche, Herbsteiche, Große Kiefer und Junge Kiefer sind auf Wunsch aus **Objekte → Einzeln** und **Objekte → Verteilen** entfernt worden. Bis ein gültiger Blender-Export vorliegt, gibt es vorübergehend **keine** Bäume für neue Platzierungen.

Die Modelle wurden nicht physisch aus dem Repository gelöscht: Schon platzierte Bäume und ihre Namen, Koordinaten, Drehungen und Größen bleiben in vorhandenen Karten lesbar. Sowohl der Import als auch die manuellen Bereinigungsaktionen erhalten diese vier früheren GLB-Varianten. Die aktuelle `worldmap.json` wird nicht automatisch geändert.

## Nicht importierbare Datei

Die am 7. November 2026 erneut bereitgestellte Datei `Tree green 1(2).glb` ist **nur 1.344 Bytes** groß, SHA-256 `5b3247194f3623e7011143d774c737a33fe3bb4b050172e26b40b88e03d8ad53`, und stimmt exakt mit dem vorherigen Fehlerexport überein. Die Datei enthält ein `Plane`-Mesh mit vier Vertices und zwei Dreiecken, aber keine sichtbare Geometrie des `Stylized Tree Generator`, keine Baumkrone, keinen Stamm und keine Bildtexturen. Sie wurde deshalb nicht als 3D-Baum eingebaut. Es gibt keine gefälschte Ersatzfigur unter ihrem Namen.

## Korrekte Neuausgabe

Im Blender-Objektmodus den tatsächlichen Baum statt der `Plane` auswählen; bei Geometry Nodes die Instanzen per `Realize Instances` in Geometrie umwandeln oder eine Kopie mittels **Objekt → Konvertieren → Mesh** herstellen. Im neuen Mesh kontrollieren, dass Stamm und Krone als Dreiecksgeometrie vorhanden sind. Nur diese Mesh-Objekte als **glTF 2.0 / GLB**, `Selected Objects` und mit angewendeten Modifikatoren exportieren. Das exportierte GLB probeweise in einer neuen Blender-Datei wieder importieren. Erst ein GLB mit wirklichem Stamm und Blättern wird der Palette hinzugefügt.

## Veröffentlichung

Nur der Online-Editor unter `https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html` ist die Arbeitsoberfläche. Änderungen auf `work` durchlaufen automatische Tests und werden nach erfolgreicher Prüfung zusammen mit dem echten Browser-Build über `main/preview` veröffentlicht. Die eigene Kartenarbeit wird im selben Browser automatisch gespeichert und kann zusätzlich als `worldmap.json` exportiert werden.

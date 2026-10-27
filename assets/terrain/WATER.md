# Bachoberfläche

`src/water.js` ist eine eigene GPU-Shaderquelle für Nebeljagd. Sie benötigt keine
Bildtextur und keinen externen Assetdienst. Eine einzige mehrfach unterteilte
Flussfläche folgt der vorhandenen Mittellinie; ihre UV-Längskoordinate wird in
Welteinheiten gemessen und hält Strömung und Rippel über Kurven hinweg zusammen.

Der Vertexshader hebt die Oberfläche im Zentimeterbereich an. Die Fragmentstufe
mischt breite Strömungswirbel, feinere bewegte Rippel, unregelmäßige Reflexe,
Caustic-Nähte und driftenden Uferschaum in einer gedämpften Blaugrün-Palette.
Die Oberfläche am Ufer bleibt ruhig in den vorhandenen Boden eingebettet.

Die Fläche erzeugt einen Draw Call. Geometrie und Attribute werden einmal
erstellt; animiert werden ausschließlich Uniforms. Die niedrige Qualitätsstufe
verwendet sechs Querunterteilungen, die hohe zehn. Es gibt keine Pro-Frame-
Geometrie- oder Instanzmatrix-Uploads. `setZoneRadius()` dunkelt Wasser außerhalb
der sicheren Zone passend zur Welt ab. Brücke, Flussbreite und Kollisionen
bleiben Aufgabe der Weltlogik und werden von diesem Modul nicht verändert.

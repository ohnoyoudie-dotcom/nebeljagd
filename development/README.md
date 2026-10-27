# Nebeljagd – Landschaftswerkzeuge auf `work`

[Spiel dauerhaft im Browser öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/nebeljagd.html) ·
[Editor dauerhaft öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html)

[Spiel und Editor herunterladen](https://github.com/ohnoyoudie-dotcom/nebeljagd/raw/refs/heads/work/development/nebeljagd-welt-und-editor.zip)

1. Das ZIP vollständig in einen Ordner entpacken.
2. `map-editor.html` im Browser öffnen, um die Karte zu bearbeiten.
3. `nebeljagd.html` öffnet das Spiel. **In 3D testen** übergibt den Entwurf aus
   dem daneben liegenden Editor; alternativ JSON exportieren und im Spiel
   **Eigene Karte laden** verwenden.

Die sechs Editorbereiche enthalten Vegetations- und Bodenpinsel, Radierer,
natürliche Objektverteilung, Wind mit lokalen Zonen und acht Biome. Höhe,
Dichte, Farben und eigene Vorlagen werden mit der Karte gespeichert.
Die vorhandenen Modelle bleiben im Objektkatalog auswählbar.

Die mitgelieferte Ausgangskarte enthält 4.030 Objekte, darunter zehn
zerstörbare Holzkisten. Möbel, Häuser und andere feste Objekte blocken
die Bewegung; Holzkisten und die Esstische in den 31 Häusern geben nach
Zerstörung auch Sicht und Weg frei. Änderungen im Browser als JSON oder
Editor-HTML sichern; sie überschreiben die Projektdatei nicht automatisch.
Die SVG ist eine zusätzliche Grafikdatei und wird nicht automatisch zurück
nach JSON gelesen.

Dieses Paket gehört zum Entwicklungszweig `work`. Für die laufende
Browser-Version bleiben die festen GitHub-Pages-Adressen erhalten; sie werden
bei einer Veröffentlichung aktualisiert.

Prüfungen und Bedienung: [Landschaftswerkzeuge](../docs/landscape-tools.md).
Dateigrößen und SHA-256-Prüfsummen: [release.json](release.json).
Chromium- und Touch-Simulation sind geprüft; Tests auf echten Schul-iPads und
Safari stehen noch aus. Der Spielmodus ist weiterhin ein lokaler Prototyp.

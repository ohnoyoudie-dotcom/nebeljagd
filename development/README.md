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

Die mitgelieferte Ausgangskarte enthält unverändert 4.020 Objekte. Änderungen
im Browser als JSON oder Editor-HTML sichern; sie überschreiben die Projektdatei
nicht automatisch. Die SVG ist eine zusätzliche Grafikdatei und wird nicht
automatisch zurück nach JSON gelesen.

Dieses Paket gehört ausschließlich zum Entwicklungszweig `work`. Die
öffentlichen GitHub-Pages-Adressen und `main` bleiben unverändert. Eine direkte
Browser-Veröffentlichung dieser Entwicklungsversion wurde nicht eingerichtet.

Prüfungen und Bedienung: [Landschaftswerkzeuge](../docs/landscape-tools.md).
Dateigrößen und SHA-256-Prüfsummen: [release.json](release.json).
Chromium- und Touch-Simulation sind geprüft; Tests auf echten Schul-iPads und
Safari stehen noch aus. Der Spielmodus ist weiterhin ein lokaler Prototyp.

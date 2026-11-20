# Landschaftsdetails und Nebelgrenze

## Platzieren

Im Editor unter **Landschaftsdetails** stehen 29 neue Modelle bereit. Sie sind frei
skalierbar und drehbar. Die Vorschau zeigt das jeweilige Bodensymbol und die reale
Grundfläche. Speichern, erneutes Öffnen und Offline-Spiel verwenden dieselben
Modelle. Die bestehende Projektkarte bleibt unverändert; es werden keine Objekte
automatisch auf der Insel verteilt.

- Wald-, Schnee- und Sandsteinvarianten: Felsgruppen, Felsvorsprünge, Geröll,
  Torbögen, Säulenreste und Mauerreste.
- Farn, Laubgebüsch, trockene Sträucher, zwei Kakteenformen, dürrer Baum und Wurzeln.
- Wegweiser, warme Weglaterne, bodennaher Holzsteg und gebrochener Zaun.

Toröffnungen sind begehbar. Pfeiler blockieren Spieler und Geschosse, der Sturz
nur entsprechend hoch fliegende Geschosse. Kleine Pflanzen und Geröll sind
Dekoration. Der Holzsteg ist ein Bodenelement und ersetzt keine spielbare Brücke
über eine Inselgrenze. Die Laterne hat eine emissive Flamme ohne zusätzliche
teure dynamische Lichtquelle.

## Herkunft und Reproduktion

Originale prozedurale Projektmodelle: `src/nature-kit.js`, metrische Definitionen
und Kollisionskörper: `src/map/nature-kit-definitions.js`. Keine fremden Meshes,
Texturen, externen Generierungsdienste oder neuen GLB-Dateien. Farbvarianten und
mineralische Körnung entstehen direkt im vorhandenen Three.js-Renderer.
Maximal zwei zusammengeführte Materialteile pro Variante; Instancing nutzt das
bestehende Objektsystem. Automatische Geometrietests prüfen endliche Koordinaten,
Grundflächen, Höhen und ein Budget von unter 16.000 Dreiecken je Modell.

Die Editorbilder zeigen die echten Modelle. Mit laufendem Vite reproduzierbar:

```sh
NEBELJAGD_URL=http://127.0.0.1:5247 python scripts/capture-asset-previews.py --kind nature
```

WebP-Dateien, eingebettete Offline-Bilder und SHA-256-Nachweise stehen in
`assets/catalog/`. Es wurde kein externer Asset-CLI- oder GLB-Paketlauf ausgeführt.

## Nebel und Spielerorientierung

Türkisfarbene Bodenlinie mit weich aufsteigenden Schlieren, die der Geländehöhe
folgt. Für große Kreise wird nur der sichtbare lokale Bogen aktualisiert:
128 Segmente, zwei Zeichenaufrufe unabhängig vom Kartendurchmesser.

Außerhalb färbt sich die Landschaft leicht kühler. Eine zusätzliche transparente
Bildschirmvignette lässt die Mitte frei und erreicht am äußersten Rand maximal
29 % Deckkraft. Keine Unschärfe; Bedienelemente bleiben darüber lesbar.

Nach 0,7 Sekunden Reaktionszeit steigt der Schaden über acht Sekunden von 18 %
auf 50 % der konfigurierten Nebel-DPS. Bei 11 DPS entspricht das ca. 2 bis 5,5
Lebenspunkten pro Sekunde. Wiedereintritt setzt die Exposition sofort zurück.
Die Integration ist unabhängig von der Bildrate; Pause hält den Schaden an.

Ein schmaler, heller Bodenring mit Richtungsspitze folgt dem lokalen Spieler und
der tatsächlichen Blick-/Zielrichtung. Radius 0,60 m um den 0,42-m-Kollisionskörper.
Der Ring folgt Gelände und Schnee und erscheint nicht während Ankunft oder Tod.

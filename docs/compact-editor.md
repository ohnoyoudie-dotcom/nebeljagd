# Kompakter Editor und neue Inselform

Die Kartenbasis hat jetzt ausgeprägte Buchten, eine nördliche Frostzunge,
eine östliche Aschenhalbinsel und eine eingeschnittene Moorküste. Organischere
Regionsgrenzen gliedern die sieben Landschaften nach der Kartenreferenz. Ein
Meeresarm trennt den Osten ab; zwei Brücken führen über seine Wasserkanäle.
Das übrige Wegenetz bleibt für den späteren Ausbau frei.
Die Landfläche beträgt rund 1,02 km². Taverne, vier bestehende
Mauer-/Zaunstrecken, gemalte Landschaft und Spielstart bleiben erhalten.
Die neue Geometrie wird von Editor, 3D-Spiel und Minikarte gemeinsam verwendet.
Aktuelle Karte und Prüfung: [Layout nach Kartenreferenz](reference-layout.md).

## Ein Werkzeug auf einmal

Die linke Seite zeigt nur die Einstellungen des ausgewählten Unterwerkzeugs.

| Hauptbereich | Unterwerkzeuge |
| --- | --- |
| Malen | Landschaft, Gras, Bodenfarbe |
| Objekte | Einzeln, Mauern & Zäune, Verteilen |
| Radieren | Gemalte Landschaft, Grasflächen oder Objekte |
| Mehr | Karteninhalt, Wind, Ansicht & Datei |

Modellvorschauen sind kompakter. Farben, Abstände, Windböen, Einrasten,
Durchgangsbreite und zusätzliche Vorschauen lassen sich bei Bedarf aufklappen.
Auch Hinweise zur Bereinigung älterer Karten benötigen weniger Platz.
Auswählen, Karte bewegen und Rückgängig bleiben oberhalb der Karte erreichbar.
Beim Wechsel des Werkzeugs endet der vorherige Pinsel. Die Unterwerkzeuge
sind außerdem mit Pfeiltasten, Pos1 und Ende erreichbar.

Bei 1280 × 800 und 1024 × 768 sind die primären Einstellungen und Aktionen
ohne Scrollen erreichbar. Der bisherige Objektbereich hatte bei 1280 × 800
929 px zusätzlichen Scrollweg. „Einzeln“ hat jetzt keinen Überlauf; die
zusätzlichen Maueroptionen können bei kleineren Höhen weiterhin etwas scrollen.
Auf schmalen Mobilgeräten liegt ein kompakter Werkzeugbereich über der Karte.

## Öffnen und gespeicherte Entwürfe

Nach dem Aktualisieren von `work` dieselben Dateien unter `welt/map-editor.html`
und `welt/nebeljagd.html` verwenden. Eine neue Editorsitzung startet mit der
überarbeiteten Projektkarte. Wer einen älteren lokalen Entwurf wiederherstellt
oder eine alte JSON-Datei öffnet, sieht bewusst dessen gespeicherte Inselform.
Die aktuelle `worldmap.json` lässt sich über **Öffnen** laden; eigene Entwürfe
vor einem Wechsel speichern. Speichern, JSON-Rundlauf und HTML-Export bleiben
verfügbar. `main` wird durch die Aktualisierung von `work` nicht veröffentlicht.

## Prüfung der ursprünglichen Editor-Überarbeitung

Alle 266 Node-Tests und der Build sind erfolgreich. Neun Browserprüfungen
der ausgelieferten Editor-HTML-Datei sind bestanden, einschließlich des
HTML-Exports und erneuten Öffnens. Drei zusätzliche Browserprüfungen im
laufenden Spiel bestätigen Start, Bewegung und Insel-Minimap.

Die Geometrieprüfungen kontrollieren Landfläche, Küstentriangulation,
Regionsabdeckung, Startbereiche sowie Wege und Brücken. Die Browserprüfungen
kontrollieren die tatsächlich ausgelieferten HTML-Dateien: kompakte Panels,
Malen und Radieren, Undo/Redo, Tripo-Platzierung, Mauerhöhe und Durchgänge,
JSON- und HTML-Rundlauf, Mobilansicht sowie Spielstart und Minikarte.

Berichte: `docs/compact-editor-check.json`, `docs/island-runtime-check.json`.
Die Browserprüfungen verwenden Chromium mit Software-WebGL; sie sind keine
Leistungsmessung auf einem physischen Tablet.
Die neuere Biomeinteilung, die Wasserkanäle und die beiden Brücken werden im
verlinkten Bericht zum Layout nach Kartenreferenz geprüft.

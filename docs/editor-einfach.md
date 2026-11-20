# Direkter Karteneditor

Der Einstieg zeigt sechs Werkzeuge: Landschaft, Wege, Hindernisse, Objekte,
Verschieben und Radieren. Die Auswahl aktiviert den passenden Pinsel sofort.
Unter Objekte ersetzt eine durchsuchbare Bildbibliothek die abhängigen Menüs.
Die Gruppen Natur, Häuser, Deko, Beute und Waffen enthalten alle freigegebenen
Modelle. Ein Klick auf ein Bild aktiviert dessen Platzierung; erneute Klicks auf
der Karte setzen weitere Exemplare. Die Kamera passt bei Bedarf den Zoom an die
Objektgröße an. „Ganze Insel“ stellt die Übersicht wieder her.

„Verschieben“ erlaubt das Ziehen von Objekten. Auf freier Fläche bewegt es die
Ansicht. Insel- und Biomumrisse lassen sich dabei nicht versehentlich verformen.
Die Auswahl zeigt links eine kompakte Karte für Drehen, Größe, Kopieren und
Löschen. Änderungen gehen durch dieselbe Validierung und Rückgängig-Historie wie
bisher. „Weitere Eigenschaften“ erhält die detaillierten Objektoptionen.

Mauern, Zäune, Objektverteilung, Wind, Kartenumriss und Dateioptionen bleiben unter
„Weitere Werkzeuge“ verfügbar. Hausvarianten, Räume und Materialien sind unter
„Objekt anpassen“ erreichbar. Der ursprüngliche Karteninhalt wird nicht verändert.
Lokale Speicherung und Datei-Sicherung bleiben getrennt; ein Browser-Entwurf ist
keine online geteilte Karte.

## Prüfung

`npm test` prüft unter anderem Vollständigkeit und Suche der Bibliothek.
`tests/child_editor_smoke.py` prüft echte Maus-/Touch-Eingaben, Malen, Wege,
Hindernisse, Platzieren, Verschieben, Direktbearbeitung, Historie, Hausoptionen,
Suche und Datei-Roundtrip. Mit `NEBELJAGD_STANDALONE=1` prüft es zusätzlich den
Spielstart und das erneute Öffnen eines exportierten HTML-Editors. Tablet- und
Telefonansichten werden in Chromium emuliert; dies ersetzt keinen Test mit Kindern
oder eine Leistungsmessung auf einem physischen iPad.

Die vereinfachte Oberfläche verwendet bestehende Editor-Ereignisse und dieselben
Kartenformate. Beim Öffnen exportierter HTML-Dateien werden lediglich generierte
UI-Elemente neu aufgebaut; originale Formfelder und Dokumentdaten bleiben erhalten.

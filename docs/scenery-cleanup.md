# Freie Kartenbasis für neue Modelle

Auf Wunsch sind die Objektarten **Bäume, Felsen, bewachsene Erhöhungen und
Blumen** aus der Ausgangskarte und den Werkzeugen für neue Platzierungen
entfernt. Dies umfasst auch die drei zuletzt importierten Tripo-Felsen.
Ihre Originaldateien und aufbereiteten Modelle bleiben im Projekt erhalten.

Aus `worldmap.json` wurden 2.591 Bäume, 279 Felsen, 124 Blumenbeete und zwei
Erhöhungen entfernt. Die übrigen **953 Objekte** sind unverändert, darunter
alle **66 Sammel-/Beuteobjekte**. Gras, Sträucher, Wege, Gelände, Regionen,
Startbereiche, Nebelzone und andere Objekte bleiben erhalten. Das Tripo-
Wirtshaus, der Wagen, das Fass, der Brunnen und beide Truhenvarianten bleiben
im Editor auswählbar.

## Gespeicherte Entwürfe

Nach dem Aktualisieren von `work` den Editor `welt/map-editor.html` neu öffnen.
Die Ausgangskarte ist bereits bereinigt. Bei einem älteren Browserentwurf
zuerst **Wiederherstellen**, dann **Alte Landschaftsobjekte entfernen** wählen.
Der gleiche Hinweis erscheint beim Import einer älteren JSON-Datei.

Die Bereinigung ist ein einzelner, rückgängig machbarer Schritt. Beute und
andere Änderungen bleiben erhalten. Eine frühere Blumenwiese wird als
gewöhnliches Wiesengras erhalten; Position, Höhe, Dichte und Farbe ändern sich
dabei nicht. Zum dauerhaften Speichern **worldmap.json speichern** verwenden.

Die ausgemusterten Kategorien werden weder einzeln noch über Streupinsel,
gespeicherte Vorlagen oder Blumenpinsel neu erzeugt. Gelände- und Biomfarben
bleiben bearbeitbar. Alte Karten sind weiterhin lesbar, sodass die Bereinigung
bewusst erfolgt und mit **Zurück** rückgängig gemacht werden kann.

## Technische Grundlage

`src/map/retired-scenery.js` führt die vier stillgelegten Objektarten und die
unverändernde Bereinigungsfunktion. `AUTHORING_OBJECT_CATALOG` und
`isObjectAvailable()` trennen die aktive Auswahl von der Kompatibilität mit
älteren Karten. Künftig freigegebene Modelle können gezielt wieder angeboten
werden. Der historische Kartengenerator behält seine Zufallsfolge und filtert
die stillgelegten Objekte erst vor der Ausgabe; erhaltene Platzierungen werden
dadurch nicht verschoben. Die Projektkarte wurde nicht neu generiert.

Der Datenvergleich mit dem vorherigen Stand ist in
`docs/scenery-cleanup-data.json` festgehalten. Browserprüfungen werden in
`docs/scenery-cleanup-check.json` dokumentiert. `welt/` enthält die erzeugte
Ausgabe auf `work`; die öffentliche Veröffentlichung auf `main` wird durch
einen Push auf `work` nicht aktualisiert.

## Prüfung

Alle 189 Node-Tests, die Paketprüfung `npm run verify:assets` und der
Browser-Build sind bestanden. Ein direkter Datenvergleich bestätigt, dass
die 953 übrigen Objekte und sämtliche Kartendaten außerhalb der Objektliste
exakt dem vorherigen Stand entsprechen. Die ausgelieferte JSON- und SVG-Datei
stimmen mit der Projektkarte überein.

Sieben Browserprüfungen der tatsächlich ausgelieferten `welt/`-Dateien über
einen lokalen HTTP-Server sind ebenfalls bestanden: Auswahlwerkzeuge,
Bereinigung mit Rückgängig/Wiederholen, JSON-Export und Wiederherstellung,
alte Vorlagen, 3D-Übergabe, automatische Bogenaufnahme und Truhenbeute.
Keine Browserfehler oder externen Ressourcenanforderungen. Die drei
Screenshots im Prüfbericht wurden gesichtet. Diese Prüfung verwendet
Chromium mit Software-WebGL und ist keine Messung auf einem echten iPad.

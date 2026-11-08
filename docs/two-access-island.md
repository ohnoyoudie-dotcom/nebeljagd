# Östliches Teilgebiet mit zwei Landzugängen

Dieser Bericht dokumentiert den vorherigen Stand mit zwei natürlichen
Landhälsen und ohne Wege oder Flüsse. Die neuere, an der Bildvorlage orientierte
Karte ersetzt diese Zugänge durch zwei Brücken und ordnet die Biome neu.
Aktueller Stand: [Layout nach Kartenreferenz](reference-layout.md).

Die Goldheide-Lagune trennt einen großen östlichen Teil der Goldheide und
Aschenhöhen vom Inselkern. Der Bereich besitzt genau zwei natürliche
Landverbindungen: einen nördlichen und einen südlichen Zugang, jeweils rund
28 Meter breit. Es sind begehbare Landhälse; die Karte enthält keine Brücken
und keine unsichtbaren Sperren als Ersatz für Gelände.

Alle bisherigen Wege, Flüsse und Brücken wurden aus der Kartenbasis entfernt:
`paths` und `rivers` sind leer. Die Lagune ist eine eigenständige polygonale
Wasserfläche unter `waterAreas`. Sie wird tatsächlich aus dem Inselboden
ausgeschnitten und lässt sich später im Editor bearbeiten.

Die äußere Küste und die sieben Regionen bleiben erhalten. Die Landfläche
beträgt ohne Lagune rund **1,02 km²**. Taverne, vier vorhandene Mauer-/Zaunstrecken,
Landschaftsmalerei, Spielstart, Spielregeln und sämtliche zehn Startkreise
bleiben unverändert. Die Startkreise bieten weiterhin 50 Plätze und liegen
vollständig auf trockenem Land. Nur der Heideschrein-Kartenmarker wurde von
`[170, -165]` nach `[335, -120]` auf die östliche Seite versetzt, damit er nicht
in der neuen Wasserfläche liegt. Dabei wurde kein Schreinmodell platziert.

## Zugänge und Prüfung

| Zugang | Querschnitt zwischen Meer und Lagune | Geprüfter Weg über den Landhals |
| --- | --- | --- |
| Nord | `[195, -310]` bis `[175, -290]` | `[165, -320]` bis `[205, -280]` |
| Süd | `[255, 300]` bis `[233, 282]` | `[231, 307]` bis `[257, 275]` |

`tests/two_access_island.test.js` ersetzt den früheren Test des Wegenetzes.
Er prüft leere Wege-/Flusslisten, trockene Startkreise und die beiden
begehbaren Zugangslinien mit 0,8 Meter Abstand zum Wasser.

Ein Vier-Meter-Raster mit gleicher Körperreserve bildet die begehbare Fläche
ab. Bei offenen Zugängen ist die gesamte begehbare Insel zusammenhängend.
Wird einer der beiden Zugänge im Test gesperrt, bleibt der östliche Bereich
über den anderen erreichbar. Werden beide gesperrt, entstehen genau zwei
zusammenhängende Bereiche. Der östliche Bereich umfasst im Raster über
0,14 km². Diese virtuellen Sperren existieren ausschließlich im Test.

`worldmap.svg` und `docs/two-access-island.png` zeigen die endgültige Karte.
Die drei gezielten Geometrieprüfungen bestehen; der separate Browserbericht
prüft zusätzlich tatsächliches Laufen und Rollen an Zugängen und Ufern.

## Bearbeiten und Öffnen

Unter **Mehr → Karteninhalt** lassen sich Gewässerflächen auswählen, anlegen,
verschieben, über ihre Eckpunkte ändern und löschen. Änderungen unterstützen
Rückgängig und Wiederholen. Wasserflächen dürfen sich weder überlappen noch
die äußere Küste berühren. Die Prüfung schützt Startflächen und bestehende
Objekte vor Überflutung; neue Objekte und Grasflächen lassen sich nicht ins
Wasser setzen. Ohne `waterAreas` bleiben ältere Karten gültig.

Nach dem Aktualisieren von `work` weiterhin `welt/map-editor.html` und
`welt/magebrawl.html` öffnen. Ein wiederhergestellter lokaler Entwurf behält
seinen bisherigen Kartenstand. Für die neue Insel die aktuelle
`welt/worldmap.json` über **Öffnen** laden; eigene Entwürfe vorher speichern.
Die Veröffentlichung auf `main` wird nicht verändert.

Alle **279 Node-Tests**, `npm run map:check` und `npm run build` bestehen.
Zusätzlich bestehen **neun Browserprüfungen der ausgelieferten HTML-Dateien**:
Bearbeitung und Undo/Redo, JSON- und HTML-Rundlauf, beide Zugänge mit normaler
Tastaturbewegung sowie Laufen und Vorwärtsrolle gegen das Ufer. Es gab keine
Browserfehler oder externen Ressourcenanfragen. Die geprüften Datei-Hashes
stimmen mit `welt/` überein. [Browserbericht](two-access-browser.md) und
[Prüfdaten](two-access-check.json) dokumentieren den Lauf unter Chromium mit
Software-WebGL; das ist keine Leistungsmessung auf einem Endgerät.

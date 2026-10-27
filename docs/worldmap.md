# Nebeljagd: Weltkarte und Objekteditor

`worldmap.json` ist die gemeinsame Datenquelle für den Karteneditor und die
spielbare 3D-Insel. Küste, Regionen, Wege, Flüsse, Orte und alle platzierten
Weltobjekte bleiben editierbar. Der Generator baut aus diesen Daten die große
Insel auf; der frühere Walddorf-Spielstand ist separat erhalten.

## Dateien und Öffnen

| Datei | Zweck |
| --- | --- |
| `worldmap.json` | Maßgebliche Weltdaten mit stabilen IDs |
| `worldmap.schema.json` | Strukturprüfung in Code-Editoren |
| `worldmap.svg` | Editierbare Vektorkarte mit benannten Ebenen und Objektsymbolen |
| `map-editor.html` | Einstieg bei laufendem Entwicklungsserver |
| `dist/map-editor.html` | Eigenständiger Editor nach `npm run build` |
| `dist/nebeljagd.html` | Eigenständige Spielversion nach dem Build |
| `dist/nebeljagd-welt-und-editor.zip` | Spiel, Editor, Kartendaten, SVG, Schema und Kurzanleitung zusammen |

Bei `npm run dev` `/map-editor.html` öffnen. Die gebauten Einzeldateien
funktionieren ohne Server. Für „In 3D testen“ bei lokal geöffneten Dateien
`nebeljagd.html` neben `map-editor.html` legen.
Das ZIP-Paket enthält diese Ordneranordnung bereits; vor dem Öffnen entpacken.

## Bäume, Häuser und Pflanzen bearbeiten

1. Unter **„Weltobjekte setzen“** die Objektart und das Modell auswählen.
2. **„Auf Karte setzen“** aktivieren und die gewünschte Stelle auf der Insel
   anklicken. „＋ In die Mitte“ legt ein Objekt in der aktuellen Ansicht an.
   Esc beendet das Setzen.
3. Ein Objekt auf der Karte oder über die durchsuchbare Liste auswählen.
   Objektart-Filter und „Auf Karte zeigen“ helfen bei der großen Welt.
4. Das Objekt ziehen oder seine Koordinaten rechts eingeben. Modell, Drehung
   und Größenfaktor ändern und **„Änderungen übernehmen“** wählen.
5. Bei Gras und Blumen zusätzlich den Flächenradius anpassen. Über
   **„Duplizieren“** eine unabhängige Kopie anlegen oder das Element entfernen.

Verfügbar sind Bäume, Häuser, Blumenbeete, hohes und niedriges Gras, Felsen, bewachsene Erhöhungen,
Sträucher, Ruinen, Schreine, Herzen, Holztruhen, Bögen, Schwerter sowie Feuer-
und Eisstäbe. Die Ausgangskarte enthält 4.020 solche Objekte, darunter 48 Truhen und vier bewachsene Erhöhungen. Modellvarianten stehen im gemeinsamen
Katalog `src/map/objects.js`. Gras und Blumen werden als gemeinsam verschiebbare
Flächen bearbeitet; einzelne Halme und Blüten innerhalb einer Fläche sowie
Möbel eines Hausmodells sind Bestandteile des jeweiligen Assets.

**Bewachsene Erhöhung** bietet zwei Varianten: die längliche **Felskante**
(`ridge`, 12 × 5 Meter) und die kompakte **Felskuppe** (`knoll`, 6 × 5 Meter).
Die Maße gelten bei Größe 1. Beide sind feste Hindernisse mit Moos und Pflanzen
auf der Oberseite. Sie lassen sich wie Häuser verschieben, drehen, skalieren,
duplizieren und entfernen; ihre gedrehten Grundflächen bestimmen auch die
Kollisionen und Sichtdeckung im Spiel. Die Oberseite ist nicht begehbar.

Bei Waffen zeigt die Palette zusätzlich **„Seltenheit“**. Dieselbe Stufe lässt
sich rechts bei einer ausgewählten Waffe ändern; dort steht auch der tatsächliche
Trefferschaden. Fünf Stufen stehen zur Verfügung: Normal (grau), Gewöhnlich (weiß),
Ungewöhnlich (grün), Selten (blau), Legendär (orange). Ein farbiger Kreis markiert
die Stufe in der Karte. Truhen enthalten im Spiel Gold und Waffen; die Truhe
selbst hat keine Schadensstufe.

**Radiergummi aktivieren** entfernt Objekte beim Ziehen über ihre Mittelpunkte.
Der Radius reicht von 0,5 bis 24 Metern. **Alle Objekte** entfernt auch Gebäude
und bewachsene Erhöhungen; **Nur Grasflächen** schont alle anderen Objektarten.
Die rote Vorschau zeigt die betroffenen Mittelpunkte. Ganze Grasflächen werden
entfernt, keine einzelnen Halme. Küste, Regionen und Wege bleiben erhalten.
Ein Strich ist ein Rückgängig-Schritt. Esc während des Ziehens verwirft den
angefangenen Strich; Leertaste erlaubt weiterhin das Verschieben der Ansicht.

Rückgängig und Wiederholen gelten auch für Objektänderungen. Strg/⌘ Z macht
rückgängig, Strg/⌘ D dupliziert ein ausgewähltes Weltobjekt. Das Mausrad und
＋/− zoomen; mit dem Verschieben-Werkzeug oder gedrückter Leertaste die Karte
ziehen. **F** beziehungsweise „Auf Karte zeigen“ fokussiert die Auswahl.
Auf Hochformat-iPads stehen Werkzeuge und Eigenschaften unter der Karte.

Küste, Regionspolygone und Linien bleiben ebenfalls bearbeitbar: die runden
Stützpunkte ziehen, mit Doppelklick auf eine Kante oder „＋ Punkt“ einen Punkt
hinzufügen. Die Weltobjekte-Ebene lässt sich ausblenden, damit kleine Bäume
oder Grasflächen die Auswahl großer Kartenelemente nicht überdecken.

## Den Entwurf im Spiel verwenden

**„In 3D testen“** öffnet einen neuen Spieltab mit einer Kopie des aktuellen
Editorstands. Dabei werden dieselben Positionen, Modelle, Drehungen und Größen
verwendet. Spätere Änderungen im Editor werden erst beim nächsten Teststart
übernommen. Ein im Editor gedrehtes Haus besitzt auch im Spiel den gedrehten
Eingang und passende Kollisionen.

Alternativ **„JSON speichern“** wählen und die Datei im Spiel über **„Eigene
Karte laden“** öffnen. Beide Anwendungen prüfen die Daten vor der Übernahme;
die Importgrenze liegt bei 5 MB. Ungültige Daten verändern den bisherigen
Editorstand nicht. Wenn lokaler Browserspeicher gesperrt ist, kann die gebaute
Spiel-Einzeldatei eine neue HTML-Datei mit der importierten Karte speichern.
Diese anschließend im Browser öffnen.

Der Editor speichert einen lokalen Zwischenstand und bietet vorhandene Entwürfe
beim Öffnen zur Wiederherstellung an. Das schreibt keine Datei ins Repository.
Für einen dauerhaften Projektstand die exportierte Datei als `worldmap.json`
übernehmen und neu bauen. **„Editor als HTML sichern“** speichert in der gebauten
Einzeldatei den aktuellen Entwurf zusammen mit dem Editor als eigene HTML-Datei.

## SVG und JSON

SVG exportieren erzeugt die aktuelle Karte mit benannten Ebenen und Vektorsymbolen
für die Weltobjekte. Sie lässt sich etwa in Inkscape bearbeiten. Die Symbole sind
eine schematische Darstellung der platzierten Modelle; die SVG enthält keine
3D-Geometrie. Änderungen im Grafikprogramm werden nicht automatisch nach JSON
zurückübersetzt. Für Änderungen, die unmittelbar das Spiel steuern sollen,
den Editor oder die JSON-Datei verwenden.

Die Küste ist in der SVG einmal definiert; Clipping und Ufersäume referenzieren
diese Geometrie. IDs und Ebenen beim manuellen Bearbeiten möglichst erhalten.
Der normale Build überschreibt die SVG im Projektstamm nicht und erzeugt seine
eigene aktuelle Kopie unter `dist/worldmap.svg`. Nur der ausdrückliche Befehl
**`npm run map:export`** ersetzt die SVG im Projektstamm aus JSON.
`npm run map:check` prüft ihre Übereinstimmung.

## Datenvertrag

`schemaVersion: 1` bezeichnet das Format. Eine Koordinate entspricht einem Meter
in der generierten Welt. `x` wächst nach Osten, `z` nach Süden, Norden ist `-z`.
SVG-`x/y` entspricht JSON-`x/z`. IDs bleiben bei Umbenennungen erhalten.

| Datenfeld | Verwendung |
| --- | --- |
| `bounds` | Zeichenfläche und zulässiger Koordinatenrahmen |
| `island.points` | Einfacher Küstenumriss als Polygon |
| `regions` | Biome-Polygone, Farben und Beschriftungspositionen |
| `paths` | Linienzüge mit Breite und Art `main`, `trail` oder `bridge` |
| `rivers` | Wasserlinienzüge mit Breite |
| `places` | Benannte Ortsmarkierungen: Dorf, Ruine, Schrein, Landmarke oder Hafen |
| `objects` | Tatsächlich platzierte Modelle, Pflanzenflächen und Gegenstände |
| `spawnAreas` | Geplante Startbereiche mit Mittelpunkt, Radius und Kapazität |
| `zone` | Zentrum, Anfangsradius, Phasen und Nebelschaden |
| `gameplay` | Zielspielerzahl, Laufgeschwindigkeit und `spawnPosition` |

Beispiel eines Weltobjekts:

```json
{
  "id": "mein-baum-01",
  "name": "Baum am Weg",
  "kind": "tree",
  "variant": "oak",
  "position": [45, -32],
  "rotation": 0.5,
  "scale": 1.2
}
```

`rotation` ist eine Drehung um die 3D-Y-Achse in Radiant; der Editor zeigt Grad.
`scale` liegt zwischen 0,25 und 3. Gras- und Blumenobjekte besitzen zusätzlich
`radius` zwischen 0,5 und 20 Metern. Position, Drehung und Größe steuern sowohl
Darstellung als auch die zugehörigen Kollisionen. Waffen besitzen zusätzlich
`rarity`: `normal`, `common`, `uncommon`, `rare` oder `legendary`. Die Waffenarten
heißen `bow`/Variante `wood`, `sword`/`steel`, `fireStaff`/`ember` und
`iceStaff`/`frost`; eine Truhe ist `chest` mit Variante `wood`. Ortsmarkierungen in `places`
sind von platzierten Gebäuden in `objects` getrennt: ein Dorfmarker allein
erzeugt keine zusätzlichen Häuser.

Bewachsene Erhöhungen verwenden `kind: "mound"` und `variant: "ridge"` oder
`"knoll"`. Zusätzliche Höhen- oder Radiusfelder sind nicht nötig: die Modellform
enthält die abgestufte Grundfläche, und `scale` skaliert das gesamte Hindernis.
Die SVG-Symbole zeigen dieselbe Grundfläche von oben. Die vier Beispielobjekte
liegen bei `[41, -34]`, `[47, -58]`, `[31, -6]` und `[-34, -75]`; Wege, Wasser,
Hauseingänge und die bisherigen Startflächen bleiben frei.

Regionen dürfen über die Küste hinausragen; die Darstellung wird am Inselumriss
abgeschnitten. Bei überlappenden Regionen liegt der spätere Eintrag oben.
Gemeinsame Regionsgrenzen sind eigene Punkte und wandern beim Verschieben einer
Region nicht automatisch mit. Ein Küstenumbau kann vorhandene Objekte, Orte
oder Startbereiche außerhalb der Insel zurücklassen; diese zuerst versetzen
oder entfernen. Die Prüfung verhindert das Speichern eines solchen Zustands.

Die erste Objektverteilung wurde reproduzierbar mit
`scripts/seed-world-objects.js` erzeugt und in JSON gespeichert. Zur Laufzeit
entsteht kein zusätzlicher, unsichtbar gespeicherter Objektbestand. Das
Seeding-Skript überschreibt vorhandene Objekte nur mit ausdrücklichem `--replace`.
Alte Karten ohne `objects` werden mit einer leeren Objektliste normalisiert;
der Import erfindet keine neue Bebauung. Beim Import älterer Karten werden
`crystal`-Objekte mit Variante `forest` an derselben Stelle und mit derselben ID
zu Holztruhen. Alte Waffen ohne `rarity` erhalten `common`. Alle übrigen
Platzierungen bleiben erhalten.

## Größe, Nebel und Prüfungen

Die Zeichenfläche umfasst 1.200 × 1.440 Meter; die Küste misst etwa
1.070 × 1.340 Meter und umschließt rund 1,125 km² Land. Bei 5,6 m/s dauert die
längste gerade Querung etwa vier Minuten. Zehn Startbereiche mit jeweils fünf
Plätzen sind für den späteren Multiplayer vorgesehen. Der aktuelle Spielstart
liegt bei `[30, -42]` nahe Auenwacht.

Editorvorschau und Spiel verwenden denselben 20-Minuten-Nebelplan: zuerst drei
Minuten ohne Schrumpfen, dann fünf Phasen von 800 auf 20 Meter Radius.
`holdSeconds` hält den aktuellen Radius, `shrinkSeconds` führt linear zu
`radius`. `zone.center` legt das Zentrum fest. Die Editorzeitleiste ist eine
Vorschau und verändert die Daten nicht.

```sh
npm test
npm run map:check
npm run build
# Bei laufendem npm run preview auf Port 4173:
python3 tests/generated_world_smoke.py
```

`worldmap.schema.json` prüft die Struktur; `src/map/model.js` ergänzt unter anderem
endliche Koordinaten, eindeutige IDs, gültige Varianten, nicht selbstschneidende
Polygone, Inselzugehörigkeit, Startkapazität und schrumpfende Nebelradien.
Weitere Architektur- und Prüfhinweise stehen in
[`generated-world.md`](generated-world.md). Die bisherigen Berichte
`worldmap-smoke.json` und Kartenaufnahmen dokumentieren zusätzlich den früheren
Editorstand vor der Objektpalette.

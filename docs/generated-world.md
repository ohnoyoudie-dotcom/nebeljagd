# Generierte Nebeljagd-Spielwelt

Der aktuelle Spieleinstieg erzeugt eine begehbare 3D-Insel aus `worldmap.json`.
Editor und Spiel verwenden denselben Küstenumriss, dieselben Regionen, Wege,
Flüsse, Brücken, Objektpositionen und Nebelphasen. Die vorhandenen Charakter-,
Haus-, Kampf- und Sammelfunktionen werden weiterverwendet.

## Umfang des Ausgangsstands

Die Insel umfasst etwa 1,125 km² Land und sieben Landschaften: Frostkamm,
Goldheide, Herzauen, Dunkelhain, Nebelmoor, Aschenhöhen und Sonnendünen.
Regionen steuern Bodenfarbe und Höhenprofil. Die beiden Flüsse besitzen
animierte Wasserflächen; sieben gespeicherte Brücken sind begehbar. Das
Wegenetz folgt den bearbeitbaren Linienzügen.

| Gespeicherte Objekte | Anzahl |
| --- | ---: |
| Bäume | 2.601 |
| Häuser | 31 |
| Grasflächen | 741 |
| Blumenbeete | 125 |
| Sträucher | 130 |
| Felsen | 281 |
| Bewachsene Erhöhungen | 4 |
| Ruinen | 5 |
| Schreine | 4 |
| Bögen / Schwerter | 17 / 14 |
| Herzen / Truhen | 17 / 48 |
| Feuerstäbe / Eisstäbe | 1 / 1 |
| **Gesamt** | **4.020** |

Die zwei Rei-Baumvarianten und Rei-Blumen/-Sträucher sind unter anderem nahe
Auenwacht eingesetzt. Ihre Originaldateien bleiben unverändert unter
`assets/imported/rei/source/`. Die importierte Grasdatei enthielt nur eine
Bodenfläche; sichtbare Grashalme werden aus der vorhandenen Projektgeometrie
erzeugt. Herkunft und Materialanpassungen stehen in `assets/imported/rei/README.md`.

Der einzelne lokale Spieler startet bei `[30, -42]` südlich des Kräuterhauses
von Auenwacht. Die Karte sieht Startbereiche für später etwa 50 Spieler vor;
Netzwerkspiel und Teams gehören noch nicht zu diesem Ausbaustand. Drei klar
beschriftete Übungsgegner erlauben lokale Kampftests.

## Datenfluss und Zuständigkeiten

1. `src/map/runtime-document.js` übernimmt die Projektkarte, einen expliziten
   Editor-Teststand oder eine importierte JSON-Datei und prüft sie.
2. `src/generated-spatial.js` berechnet Inselzugehörigkeit, Biome, Höhen,
   Flussabstände, Hausplateaus und Brückenbereiche ohne Browser-Assetimporte.
3. `src/generated-world.js` trianguliert die Küste, erzeugt Gelände, Wege,
   Wasser und Brücken und verbindet ihre Höhen mit Bewegung und Darstellung.
4. `src/world-object-renderer.js` setzt ausschließlich `map.objects` um:
   Vegetation als Instanzen, Häuser mit Innenräumen und getrennten Dächern,
   passende Hindernisse und Grasdeckung.
5. `pickups.js` und `weapons.js` verwenden die gespeicherten Gegenstände.
   `main.js` verbindet Spielfigur, Eingaben, Kamera, Sonnenlicht und Nebel.
   Die Minikarte zeichnet dieselbe Geografie.

Der gemeinsame Objektkatalog in `src/map/objects.js` enthält die gültigen Arten
und Modellvarianten. Ändert der Editor ein Objekt, verwendet der nächste
3D-Test die neue Position, Drehung, Größe und gegebenenfalls den Flächenradius.
Es gibt keine zweite, vom Editor unabhängige Liste versteckter Bäume oder Häuser.
Grashalme, Blumen innerhalb eines Beetes und Möbel innerhalb eines Hausmodells
bleiben Bestandteile dieser gemeinsam platzierten Assets.

Vier bewachsene Erhöhungen ergänzen die vorhandenen Platzierungen bei Auenwacht.
Sie stehen ausdrücklich in `worldmap.json`; kein bisheriges Objekt wurde für
sie versetzt oder neu ausgewürfelt. Der Katalog bietet die lange Felskante
(`mound/ridge`, 12 × 5 Meter) und die Felskuppe (`mound/knoll`, 6 × 5 Meter).
`src/overgrown-mounds.js` erzeugt die gemeinsame Modellgeometrie und die
passende feste Grundfläche. Im Editor lassen sich beide Varianten anlegen und
in Position, Drehung und Größe verändern.

## Gelände, Kollisionen und Sichtbarkeit

Das Ausgangsgelände besteht aus 229.376 Dreiecken in 324 räumlichen Abschnitten.
Der Spieler steht auf der interpolierten Höhe der tatsächlich dargestellten
Geländedreiecke. Hausplateaus, Böden und Brückendecks ergänzen diese Höhe.
Kamera und Sonnenlicht folgen der Figur auch in höheren Landschaften.

Bäume und Felsen verwenden den bestehenden räumlichen Kollisionsindex. Gedrehte
und skalierte Häuser prüfen Bewegung und Pfeile in ihrem lokalen Koordinatensystem;
der Eingang wird dadurch zusammen mit dem Haus gedreht. Dächer bleiben dauerhaft
ausgeblendet und Innenräume eingeblendet; beim Betreten öffnet sich zusätzlich
die vordere Fassade. Küste und
Wasser verhindern das Weiterlaufen; Brücken ermöglichen Flussquerungen.

Bewachsene Erhöhungen besitzen steile Felsseiten und eine bepflanzte Oberseite.
Sie sind nicht begehbar: ihre aneinanderliegenden lokalen Kollisionsstreifen
blockieren Bewegung, Geschosse und Sicht. Drehung und Größenfaktor werden
zusammen mit dem Modell auf diese Streifen angewandt. Die vier Ausgangsobjekte
halten Abstand zu bestehenden Objekten, Wegen, Flüssen und Startbereichen.

Objektgruppen und Geländeabschnitte außerhalb der Umgebung des Spielers werden
ausgeblendet. Vegetation wird instanziert und verwendet Detailstufen. Die
Leistungsstufe reduziert Sichtweite, Vegetationsdetails, Render- und
Schattenauflösung. Die komplette Welt wird beim Start aufgebaut und bleibt im
Speicher: echtes Nachladen/Entladen von Abschnitten ist noch nicht implementiert.
Hardwareleistung auf Schul-iPads ist damit noch nicht nachgewiesen.

Die Nebelzone verwendet `map.zone` mit 800 Metern Anfangsradius, drei Minuten
Erkundungszeit und fünf Phasen bis auf 20 Meter nach insgesamt 20 Minuten.
Boden und Objekte außerhalb der Zone werden getönt; mehrere Nebelschichten
verdecken auch höheres Gelände. `rules.js` behält daneben die kurzen Regeln
des alten Walddorfs für dessen bestehende Tests und historische Verwendung.

## Editor-Test und Dateiimport

„In 3D testen“ öffnet `index.html?mapSource=editor` mit einem Stand des aktuellen
Editor-Dokuments. Die Übergabe verwendet lokalen Speicher oder eine auf das
geöffnete Fenster und dessen Herkunft beschränkte Nachrichtenübergabe. Bei
lokalen Einzeldateien heißt das Spielziel `nebeljagd.html`; beide HTML-Dateien
müssen im selben Ordner liegen. Ein bereits laufendes Spiel verändert sich
nicht automatisch, während der Editor weiter bearbeitet wird.

Das Spiel akzeptiert über „Eigene Karte laden“ geprüfte JSON-Dateien bis 5 MB
und erzeugt die Welt nach dem Neuladen aus diesem Dokument. Falls Browserspeicher
gesperrt ist, kann die eigenständige Spiel-HTML eine neue Einzeldatei mit der
importierten Karte speichern. Permanente Repository-Änderungen erfolgen weiter
durch Übernehmen der exportierten `worldmap.json` und einen neuen Build.

`scripts/build-browser.js` baut Spiel und Editor getrennt, damit gemeinsame
Kartenmodule keine extern benötigten JavaScript-Chunks erzeugen.
`scripts/build-standalone.js` bettet Skripte, CSS und lokale Modelle in die
Einzeldateien ein. Der normale Build verändert die SVG im Projektstamm nicht.
`scripts/package-world-bundle.js` erzeugt zusätzlich
`dist/nebeljagd-welt-und-editor.zip` mit beiden HTML-Dateien, JSON, SVG, Schema
und `Anleitung.txt`, damit der lokale 3D-Test aus dem Editor zusammenbleibt.

## Validierung und frühere Stände

```sh
npm test
npm run verify:assets
npm run map:check
npm run build
# Mit npm run preview auf Port 4173:
python3 tests/tactical_loot_smoke.py
python3 tests/loot_editor_smoke.py
```

Die Node-Tests prüfen unter anderem Karten-/Objektvalidierung, reproduzierbare
Objektverteilung, Küste, Brücken, Kartenimport, Kollisionen und Lootpositionen.
Die Browserprüfung verfolgt die tatsächliche Welt und den Editor-Spiel-Rundlauf.
Der frühere Integrationsbericht steht unter `docs/generated-world-smoke.json`
und die zugehörigen Aufnahmen unter `docs/screenshots/generated-world*.png`
abgelegt. Bisherige Walddorf-Skripte mit festen alten Koordinaten sind historische
Prüfungen und kein Nachweis der großen Insel.

Im vorherigen Inselstand bestanden 37 Node-Tests und zwölf Integrationsszenarien.
Der neue Sicht-/Kampfstand ist separat in `docs/tactical-combat.md` dokumentiert. Geprüft wurden
unter anderem Bewegung, Rolle, Karten-Loot, Pfeiltreffer, gedrehte Hauseingänge,
Grasdeckung, alle sieben Biome, Wasser-/Küstenbegrenzung, Brücken, Nebelschaden
und der tatsächliche Editor-zu-Spiel-Rundlauf einschließlich JSON-Import.
Aufnahmen: [Auenwacht](screenshots/generated-world-auenwacht.png),
[Innenraum](screenshots/generated-world-interior.png) und
[Objekteditor](screenshots/generated-world-editor-objects.png).

Die verwaltete Browserumgebung kann direkte `file://`-Navigation sperren. Ein
Offline-Test mit unveränderten Einzel-HTML-Bytes bei gesperrtem Netzwerk prüft
die Selbstständigkeit der Datei, ersetzt aber weder den Test auf einem physischen
iPad noch einen Leistungsnachweis in Safari.

Der vorherige spielbare Walddorfstand liegt unverändert unter
`public/versions/nebeljagd-walddorf-v012.html`. Frühere 3D- und 2D-Stände bleiben
ebenfalls erhalten; zehn Prüfsummeneinträge stehen in
`archive/preserved-versions.json`. Der Build kopiert die HTML-Sicherungen nach
`dist/versions/`.

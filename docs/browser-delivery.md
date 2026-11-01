# Browser-Einstieg und erzeugte Dateien

## Aktueller lokaler Build

`npm run build` erzeugt den vollständigen Browserstand in `dist/` und
synchronisiert ihn automatisch nach `welt/`:

- `welt/index.html`: Startseite mit Schüler- und Lehrkraftzugang.
- `welt/teacher.html`: Lehrkraftbereich mit Codeverwaltung und Editor-Link.
- `welt/lobby.html`: Einstieg in die Übungswiese nach Anmeldung.
- `welt/map-editor.html`: aktueller eigenständiger Editor.
- `welt/nebeljagd.html`: eigenständiges Spiel, auch für Editor-Spieltests.
- `welt/nebeljagd-welt-und-editor.zip`: Browserdateien, Kartendaten und Anleitung.

`welt/index.html` ist die Startseite. Sie darf beim Veröffentlichen nicht durch
eine Kopie des Spiels ersetzt werden. **In 3D testen** öffnet aus dem gebauten
Editor ausdrücklich `nebeljagd.html?mapSource=editor` und übergibt den Entwurf.
In Vite wird stattdessen `game.html?mapSource=editor` verwendet.

`welt/release.json` enthält die Build-Kennung sowie Größen und SHA-256-Werte
aller ausgelieferten Dateien. Der Lehrkraftbereich verlinkt den Editor dieses
Serverstands und zeigt dessen Erstellungszeit. Der Schulserver liefert die
HTML-Dateien ohne Browsercache aus.

## Klassenbetrieb und Offline-Dateien

Für gemeinsam gültige Zugangscodes läuft der Node-Schulserver mit `welt/` als
Browserverzeichnis. Einrichtung und Start stehen in [classroom.md](classroom.md).
GitHub Pages und das Öffnen einer lokalen HTML-Datei führen diesen Server
nicht aus. Ohne Server erklärt die Startseite den Offline-Modus und bietet
den eigenständigen Editor an; Spiel und Editor lassen sich weiterhin direkt
öffnen. Das ZIP ist ein Offline-Paket und richtet keinen Schulserver ein.

## Aktualisieren und bereitstellen

Die URLs bleiben bei Aktualisierungen desselben Serververzeichnisses gleich.
Nach Quellcodeänderungen Tests und `npm run build` ausführen, dann die erzeugten
Dateien prüfen. Ein lokaler Build aktualisiert `welt/` in der Arbeitskopie;
er überträgt die Dateien nicht automatisch auf andere Rechner oder ins Internet.

Der Workflow `work-build-check.yml` prüft und veröffentlicht den vollständigen
Build ausschließlich auf `work`. Historische Gras-Patch-Workflows erzeugen
Prüfartefakte und überschreiben keine aktuellen `welt/`-Dateien mehr.
Eine Veröffentlichung auf `main` oder einem öffentlichen Server ist ein eigener,
expliziter Bereitstellungsschritt. Dabei den vollständigen aktuellen Stand
übertragen und `index.html` als Startseite erhalten; den Editor-Spiel-Übergang
und beim Schulserver beide Anmeldewege auf der tatsächlichen Adresse prüfen.

Browseränderungen im Editor müssen weiterhin als JSON gespeichert und für einen
neuen Projektstand als `worldmap.json` übernommen werden. Sie ändern die
veröffentlichte Ausgangskarte nicht automatisch.

## Bestehende öffentliche Adressen und ältere Stände

Die bisherigen GitHub-Pages-Adressen verwenden `main` und wurden durch den
lokalen Klassenportal-Build nicht aktualisiert:

- [Bisheriger Einstieg](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/)
- [Bisheriger Editor](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/map-editor.html)
- [Bisheriges Offline-Paket](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/nebeljagd-welt-und-editor.zip)
- [Separate ältere Entwicklungsvorschau](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/nebeljagd.html)

Der erste veröffentlichte Stand wurde mit Commit `c79e642` unter `welt/`
ergänzt. Commit `63d2a73` aktualisierte ihn um taktische Sicht, Truhen, Gold,
Seltenheiten und Elementarwaffen. Die folgenden Angaben dokumentieren frühere
Veröffentlichungen und gelten nicht als Prüfung des neuen Klassenportals:

Commit `4b5812a` aktualisiert denselben Pfad um den Graspinsel, 24 Modellvorschauen,
helleren Sichtnebel, Bewegungsübergänge, automatische erste Waffenaufnahme,
Schadensfeedback, Seltenheitsleuchten und die größere Minikarte. Die Prüfung
umfasst 80 Node-Tests, sieben Spiel- und neun Pinsel-/Editor-Browserabläufe sowie
beide eigenständigen HTML-Dateien ohne HTTP/S-Anfragen.

Commit `d774a89` ergänzt dichteres Versteckgras aus dem erhaltenen v011-Quellstand,
graues Natursteinpflaster, abgestimmtes Licht, vier bewachsene Erhöhungen und
den Radiergummi. Die Karte enthält nun 4.020 Objekte und 26 Modellvarianten.
Der vorige Browserstand ist separat als `nebeljagd-graspinsel-v015.html` gesichert.
95 Node-Tests, sechs Welt-Browserabläufe, neun Radiergummi-Browserabläufe,
beide Grasqualitätsstufen und beide eigenständigen HTML-Dateien ohne HTTP/S
wurden geprüft. Berichte: `reference-world-check.json`, `object-eraser-check.json`,
`grass-restoration-check.json`, `reference-offline-check.json`; die anschließende
öffentliche Prüfung steht in `public-delivery-check.json`.

Vor Veröffentlichung wurden die zwischenzeitlich auf `main` ergänzten Ordner
`Blender/` und `Welt und Editor/` per Fast-forward übernommen. Die Aktualisierung
ändert ausschließlich die erzeugten Dateien unter `welt/`.

Der aktuelle Schattenbuild speichert Sichtentfernungen mit Half-Float-Präzision
und nutzt einen dichteren 17-Punkt-Gaußfilter. Das reduziert sichtbare
Entfernungsstufen an langen Hindernisschatten. Der 50-Prozent-Schwarzwert bleibt
erhalten. Der Build wurde mit 127 Node-Tests und einem lokalen WebGL-Browserlauf
ohne Shader- oder Konsolenfehler geprüft.

Der folgende Sichtbuild skaliert die Winkelweichzeichnung mit der Entfernung,
damit Hindernisschatten auch in der Ferne ihre dunkle Deckkraft behalten. Truhen,
Waffen und Sammelgegenstände erscheinen nur noch bei freier Sicht; das Gelände
und die übrige Umgebung bleiben sichtbar.

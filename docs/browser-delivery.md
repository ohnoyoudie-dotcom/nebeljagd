# Öffentliche Browser- und Download-Adressen

## Separate Browser-Vorschau für die aktuelle Entwicklung

Die aktuelle Entwicklung ist unter einem eigenen, stabilen GitHub-Pages-Pfad
erreichbar; die bestehende Hauptseite und `welt/` bleiben erhalten:

- Spiel: https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/nebeljagd.html
- Kurzlink: https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/
- Editor: https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html

Der veröffentlichte Ordner `preview/` enthält nur den eigenständigen Build und
Kartendaten. Die Quelldateien und die fortlaufende Entwicklung bleiben auf
`work`. Neue Builds aktualisieren ausschließlich diese Vorschau-Dateien.

## Aktuelle Entwicklung: Landschaftswerkzeuge auf `work`

Die neue Landschaftserweiterung wird ausdrücklich **nur auf `work`** gesichert.
`main` enthält dafür ausschließlich die zusätzlich veröffentlichte
`preview/`-Ausgabe; die bestehende Spielseite, `welt/` und die Quelldateien
bleiben unverändert. Der geprüfte Entwicklungsbuild steht im Verzeichnis
`development/`; sein [ZIP-Download](https://github.com/ohnoyoudie-dotcom/nebeljagd/raw/refs/heads/work/development/nebeljagd-welt-und-editor.zip)
enthält Spiel, Editor und Kartendaten für die Offline-Nutzung.

## Bestehende Veröffentlichung

Die Dateianhänge dieses Chats ließen sich beim Nutzer nicht herunterladen.
Der geprüfte Browser-Build liegt deshalb zusätzlich auf dem bereits bestehenden
GitHub-Pages-Server des Projekts:

- Spiel: https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/
- Editor: https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/map-editor.html
- Komplettpaket: https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/nebeljagd-welt-und-editor.zip

Der erste veröffentlichte Stand wurde mit Commit `c79e642` auf `main` unter
`welt/` ergänzt. Commit `63d2a73` aktualisiert diese Dateien um taktische Sicht,
Truhen, Gold, Seltenheiten und Elementarwaffen. GitHub Pages verwendet weiterhin `main` und den Repository-Stamm;
das ältere Spiel auf der Hauptebene bleibt erreichbar. Die Projektquellen
dieser Cloud-Arbeitskopie und die erzeugten Dateien in `dist/` sind davon
getrennt. `welt/` im veröffentlichten Repository ist ein erzeugter Build.

`welt/index.html` ist identisch mit der eigenständigen Spielversion. Dadurch
führt „In 3D testen“ aus dem daneben liegenden Editor zur passenden neuen
Spielversion und übernimmt deren Entwurf. Das ZIP enthält dieselben HTML-Dateien
für die Offline-Nutzung. `welt/release.json` hält Größen und SHA-256-Werte fest.

## Künftige Aktualisierungen

Die URLs bleiben bei Aktualisierungen desselben Verzeichnisses gleich.
Ein lokaler Build veröffentlicht noch nichts: nach `npm run build` müssen die
neuen Dateien bewusst nur in `preview/` auf dem Pages-Quellbranch übernommen
werden. Dazu eine separate Arbeitskopie vom aktuellen `origin/main` verwenden,
damit die laufenden Quellcodeänderungen dieser Arbeitskopie erhalten bleiben.

Zu übernehmen sind `dist/nebeljagd.html` als `preview/nebeljagd.html` und
`preview/index.html`, `dist/map-editor.html`, JSON, SVG und JSON-Schema. Die
Prüfsummen in `preview/release.json` aktualisieren. Nach dem Push auf die
Bereitstellung warten und die HTTPS-Dateien sowie den Editor-zu-Spiel-Übergang
prüfen. Der Nutzer muss Änderungen im Browser-Editor weiterhin als JSON
speichern; sie verändern die veröffentlichte Ausgangskarte nicht automatisch.

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

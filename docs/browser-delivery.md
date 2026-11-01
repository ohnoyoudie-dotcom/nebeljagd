# Öffentliche Browser- und Download-Adressen

## Drei Tripo-Waffen · 1. November 2026

[Aktuellen Editor öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=2dc0dfb).
Unter **Objekte → Einzeln** sind **Schwert**, **Feuerstab (Lavastab)** und
**Eisstab (Kristallstab)** mit echten Tripo-Modellvorschauen auswählbar.
Die Modelle erscheinen auch als Beute und in der Hand der Spielfigur.
Die vorhandene Vier-Biome-Karte bleibt unverändert.

Veröffentlichungscommit: `2dc0dfbda768eee80a81dca1c189b63287e721f8`, ausschließlich
`preview/` auf `main`. Quellstand: `06cdee7`; geprüfter Browserbuild auf `work`:
`28bd19a`. `preview/release.json` enthält die acht Dateigrößen und Prüfsummen.
**311 Node-Tests**, Assetprüfung, Kartenprüfung und Build sowie jeweils acht
Editor- und Spielprüfungen bestanden. Der tatsächliche relative Übergang
`/preview/map-editor.html` → `/preview/index.html?mapSource=editor` wurde mit
bytegleichen Dateien lokal geprüft, ohne Browserfehler oder zusätzliche Anfragen.
Befunde und Screenshots: [Waffenintegration](tripo-weapons-integration.md).

GitHub Pages hat diesen exakten Commit erfolgreich bereitgestellt:
[Build und Veröffentlichung](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41306820635).
Der direkte Pages-HTTPS-Aufruf ist in dieser Umgebung durch die Netzwerkpolicy
gesperrt; der Bereitstellungsstatus wurde über die GitHub-Actions-Webseite bestätigt.

## Bereinigte Vier-Biome-Karte · vorherige Ausgabe vom 1. November 2026

Die aktuelle Ausgabe liegt im öffentlichen Vorschauordner:
[Editor öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=df3b250).
Veröffentlicht wurde ausschließlich `preview/` auf `main` mit Commit
`df3b250b686ac244a14e1a03b23cd7ef5714f1c2`. Die Dateien entsprechen exakt dem
geprüften `welt/`-Build aus `work`-Commit `9c9ac60`, mit Quellstand `4aeee98`.
`preview/release.json` enthält Herkunft, Dateigrößen und SHA-256-Prüfsummen.

Die Karte enthält vier Biome und zwei Brücken sowie die vorhandenen Objekte;
Orts-/Häusersymbole, Regionsbeschriftungen und Spawn-Zonen sind entfernt.
Editor und Spiel sind als zusammenpassende Ausgabe veröffentlicht. Lokal unter
dem tatsächlichen `/preview/`-Pfad geprüft: frischer Editor mit aktueller Karte
und Übergabe über **Spielen** an das rendernde Spiel, einschließlich Spielstart.
Beide Prüfungen bestanden ohne Browserfehler oder externe Anfragen.

GitHub-Pages-Bereitstellung erfolgreich abgeschlossen:
[pages build and deployment](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41303186334).
Der direkte HTTPS-Aufruf der Pages-Domain ist in dieser Cloud-Umgebung durch
die Netzwerkpolicy gesperrt. Der Veröffentlichungsstatus wird daher über die
GitHub-Actions-Webseite geprüft; der Browsercheck erfolgte mit identischen
Dateien lokal. Alte lokale Entwürfe werden nur nach ausdrücklich gewähltem
**Wiederherstellen** geladen. Der Versionsparameter im Link umgeht einen
zwischengespeicherten älteren Editor.

## Separate Browser-Vorschau für die aktuelle Entwicklung

Die aktuelle Entwicklung ist unter einem eigenen, stabilen GitHub-Pages-Pfad
erreichbar; die bestehende Hauptseite und `welt/` bleiben erhalten:

- Spiel: https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/nebeljagd.html
- Kurzlink: https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/
- Editor: https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html

Der veröffentlichte Ordner `preview/` enthält nur den eigenständigen Build und
Kartendaten. Die Quelldateien und die fortlaufende Entwicklung bleiben auf
`work`. Neue öffentliche Entwicklungsbuilds aktualisieren ausschließlich diese Vorschau-Dateien.

## Aktuelle Entwicklung: Landschaftswerkzeuge auf `work`

Die neue Landschaftserweiterung wird ausdrücklich **nur auf `work`** gesichert.
`main` enthält dafür ausschließlich die zusätzlich veröffentlichte
`preview/`-Ausgabe; die bestehende Spielseite, `welt/` und die Quelldateien
bleiben unverändert. Der geprüfte Entwicklungsbuild steht im Verzeichnis
`welt/` auf `work`; sein [ZIP-Download](https://github.com/ohnoyoudie-dotcom/nebeljagd/raw/refs/heads/work/welt/nebeljagd-welt-und-editor.zip)
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

Der aktuelle Schattenbuild speichert Sichtentfernungen mit Half-Float-Präzision
und nutzt einen dichteren 17-Punkt-Gaußfilter. Das reduziert sichtbare
Entfernungsstufen an langen Hindernisschatten. Der 50-Prozent-Schwarzwert bleibt
erhalten. Der Build wurde mit 127 Node-Tests und einem lokalen WebGL-Browserlauf
ohne Shader- oder Konsolenfehler geprüft.

Der folgende Sichtbuild skaliert die Winkelweichzeichnung mit der Entfernung,
damit Hindernisschatten auch in der Ferne ihre dunkle Deckkraft behalten. Truhen,
Waffen und Sammelgegenstände erscheinen nur noch bei freier Sicht; das Gelände
und die übrige Umgebung bleiben sichtbar.

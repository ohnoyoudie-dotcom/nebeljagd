# Browser-Einstieg, Veröffentlichung und erzeugte Dateien

## Aktueller Editor mit Levelaufstiegen

[Aktuellen Editor öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=d214571).
Über **Spielen** wird dieselbe Karte in der aktualisierten Spielversion geöffnet.
Jeder besiegte Gegner erhöht das Level um eins und die aktuellen/maximalen
Lebenspunkte um 25. Die Levelzahl steht links am Balken; seine Breite bleibt gleich und die
25-LP-Abschnitte werden feiner. Die Übungswiese verwendet ebenfalls das neue
Maximum und beginnt nach Zurücksetzen wieder bei Level 1 mit 100/100 LP.

Quellstand: `9447a30b73fd3c9b34b2efd7c0fcd8493e61bacf`; Build `ad5a6521cf3a`;
Auslieferung auf `work`: `d516eface8c9b4cc994d377ba99b81d62dbab35e`.
Veröffentlichungscommit: `d214571b3d85bfa6cfe2af32f9895ba23ceeed63`, ausschließlich
vier Dateien im bestehenden statischen `preview/`. Der Portal-Einstieg unter
`welt/index.html` und Dateien außerhalb der Vorschau bleiben erhalten.
Die Vorschau bietet weiterhin keine Klassenanmeldung; der echte Klassenserver
wurde für die Prüfung nur temporär lokal gestartet.

369 Node-Tests, Asset- und Kartenprüfung, sieben Spielabläufe, fünf echte
Klassenserver-/Übungsabläufe und die normale Editor-zu-Spiel-Übergabe bestanden.
Alle Browserprüfungen verwendeten die tatsächlichen erzeugten Dateien.
Keine Browser-/Shaderfehler; die Nutzerkarte einschließlich ihrer drei Waffen
ist unverändert. Details: [Levelsystem](level-progression.md).

[GitHub Pages](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41328827556)
hat genau den Veröffentlichungscommit `d214571` erfolgreich bereitgestellt.
Die Browserprüfungen verwendeten lokal bytegleiche Dateien, da die Pages-Domain
durch die Netzwerkpolicy dieser Umgebung gesperrt ist.

## Vorherige Ausgabe mit einhändiger Zauberanimation

[Damals verwendeter Editorlink](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=476f9d0).
Beim Zaubern führt nur der Stabarm die Vorwärtsbewegung aus; die freie Hand
behält ihre natürliche Stand-/Laufbewegung. Das Projektil beginnt direkt an
der Kristallspitze und geht von dort kontinuierlich in die bisherige Flugbahn
über. Alten Spiel-Tab schließen und im aktuellen Editor **Spielen** öffnen.
Details: [Einhändiges Zaubern](one-handed-cast.md).

Quellstand: `5857a3c1fe451bc9257f0126470e4a82fa9d907a`; Build `0e8227126343`.
Veröffentlichungscommit: `476f9d042c4d0e053c2f4ee6444bbf5f127823e6`, ausschließlich vier Dateien unter
`preview/` auf `main`; alle neun Paketdateien verifiziert.
358 Node-Tests und sechs Browserprüfungen bestanden. Acht Spielaufnahmen aus
beiden Seitenrichtungen geprüft; keine Browser-, Shader-, WebGL- oder
HTTP-Fehler. Die Nutzerkarte und Modelle bleiben unverändert.

[GitHub Pages](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41327380636)
hat genau diesen Commit erfolgreich bereitgestellt. Die unveränderliche
Versionsdatei stimmt mit dem geprüften Paket überein. Der Browsercheck verwendete
lokal identische Dateien, da die Pages-Domain durch die Netzwerkpolicy dieser
Umgebung gesperrt ist.

## Vorherige Ausgabe mit korrigierter Griffposition

[Damals verwendeter Editorlink](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=9332ab4).
Feuer- und Eisstab sitzen nun in der rechten Handfläche. Der Griffpunkt folgt
der Hand beim Laufen, Drehen und Zaubern. Alten Spiel-Tab schließen und im
aktuellen Editor **Spielen** öffnen. Details: [Griffposition](weapon-grip.md).

Quellstand: `cac1b929232ef28d41bb6cb076336e258475b9cd`; Build `70f667e08ed9`.
Veröffentlichungscommit: `9332ab4e51fa121b9934e12bfa628ab8910cc296`, ausschließlich
vier Dateien unter `preview/` auf `main`; alle neun Paketdateien verifiziert.
351 Node-Tests und acht Browserprüfungen bestanden. 14 Spielaufnahmen geprüft;
keine Browser-, Shader-, WebGL- oder HTTP-Fehler. Die Modelle und Nutzerkarte
sind unverändert erhalten.

[GitHub Pages](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41323013688)
hat genau diesen Commit erfolgreich bereitgestellt. Die unveränderliche
Versionsdatei bestätigt Quellstand und Build. Der Browsercheck verwendete lokal
identische Dateien, weil die Pages-Domain durch die Netzwerkpolicy dieser
Umgebung gesperrt ist.

## Vorherige Ausgabe mit verfeinerten Zaubereffekten

[Damals verwendeter Editorlink](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=8cc85dd). Feuer besitzt weich bewegte orangefarbene
Flammen und einen zusammenhängenden Schweif. Eis zeigt beleuchtete
Kristallflächen, Glanzpunkte und eine feine Frostfahne. Einschläge klingen in
mehreren Schichten aus. Alte Spiel-Tabs schließen, **Spielen** öffnen und mit
**F** zaubern. Die gespeicherte Nutzerkarte bleibt unverändert.

Quellstand: `71ec3f72db356167cc320452a886d3c251569389`; Build `325de0c67035`.
Veröffentlichungscommit: `8cc85dd8e2f9856a10a944242f4d2d165213b7ad`, ausschließlich
`preview/` auf `main`. Alle 347 Node-Tests und fünf Browserprüfungen bestanden;
zwölf Spielaufnahmen im Vergleich mit der ersten Fassung geprüft.
Keine Browser-, Shader-, WebGL- oder HTTP-Fehler.
Details: [Verfeinerte Zaubereffekte](spell-effects-v2.md).

[GitHub Pages](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41315205697) hat genau diesen Commit erfolgreich bereitgestellt.
Die veröffentlichte Versionsdatei bestätigt den geprüften Build. Browserprüfungen
verwendeten lokal identische Dateien, da direkte Pages-HTTP-Aufrufe durch die
Netzwerkpolicy dieser Umgebung gesperrt sind. Der Klassenserver wurde durch
diese statische Vorschau nicht veröffentlicht.

## Erste Ausgabe mit Feuer- und Eiseffekten

[Damals verwendeter Editorlink](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=90b28a7). Feuer und Eis besitzen eigene Lade- und
Abschusseffekte, sichtbar unterschiedliche Projektile und Schweife sowie
Trefferimpulse. Im Editor **Spielen** öffnen, einen Stab aufnehmen und **F** drücken.
Alte Spiel-Tabs schließen und neu über den aktualisierten Editor öffnen.
Die Nutzerkarte einschließlich ihrer drei Waffen bleibt unverändert.

Quellstand auf `work`: `058f350b00814ea3dc38156ae0ffbbf1c7fdee94`; Build `e2b9356f0be1`.
Veröffentlichungscommit: `90b28a782679a9ef0d201d0f4f9e8f6cf5779287`, ausschließlich
`preview/` auf `main`. 344 Node-Tests und fünf Browserprüfungen bestanden;
zehn Screenshots geprüft, keine Browser-, Shader- oder HTTP-Fehler.
Details: [Zaubereffekte](spell-effects.md).

[GitHub Pages](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41313067996) hat genau diesen Commit erfolgreich bereitgestellt.
Das veröffentlichte Release-Protokoll stimmt mit dem getesteten Paket überein.
Die Browserprüfungen liefen mit identischen Dateien lokal, da direkte
Pages-HTTP-Aufrufe durch die Netzwerkpolicy der Umgebung gesperrt sind.
Der Klassenserver wurde durch diese statische Vorschau nicht veröffentlicht.

## Vorherige Ausgabe mit korrigiertem Waffenwechsel

[Damals verwendeter Editorlink](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=a786ff0). Beim Wechsel mit **E** liegt die bisherige
Waffe an der Fundstelle der neuen und lässt sich wieder aufnehmen. Ihre ID,
ihr Modell und ihre Seltenheit bleiben erhalten. Die drei vom Nutzer gesetzten
Waffen sind unverändert in der Ausgangskarte enthalten. Bereits geöffnete
Spiel-Tabs schließen und über **Spielen** neu öffnen.

Veröffentlichungscommit: `a786ff0cdb5ae8df8b1014d1b788e585df669740`, ausschließlich
`preview/` auf `main`; Quellstand auf `work`: `d5e20584aab7ff6149c63c5e5f95b1b6c2e8e5ec`.
Build: `03d805c5e9d5`. 337 Node-Tests, sieben Browserprüfungen, Asset- und
Kartenprüfung bestanden. Der echte Übergang von `/preview/map-editor.html`
zu `/preview/nebeljagd.html` übernimmt auch den Versionsparameter des Editorlinks.
Details und Prüfbericht: [Waffenwechsel](weapon-swap.md).

[GitHub Pages](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41311535345) hat genau diesen Commit erfolgreich bereitgestellt.
Das veröffentlichte Release-Protokoll stimmt mit dem geprüften Paket überein.
Der direkte Pages-HTTP-Aufruf ist durch die Netzwerkpolicy dieser Umgebung
gesperrt; die Browserprüfungen verwendeten lokal dieselben Dateien.
Diese statische Ausgabe enthält weiterhin den eigenständigen Editor und das
Spiel; der Klassenserver wurde damit noch nicht veröffentlicht.

## Vorherige Ausgabe mit drei Tripo-Waffen

[Damals verwendeter Editorlink](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=2dc0dfb).
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


Diese öffentliche Spiel- und Editor-Ausgabe enthält noch keine Schüler- oder
Lehrkraft-Anmeldung. Der neue Klassenstart und die Hosting-Vorbereitung unten
wurden damit noch nicht veröffentlicht.

## Neuer Klassenstart und Hosting-Vorbereitung

Die neue Startseite führt Schüler mit Zugangscode auf die Übungswiese und
Lehrkräfte zur Codeverwaltung und zum aktuellen Editor. Dafür läuft der
Node-Schulserver mit `welt/` als Browserverzeichnis. Einrichtung und lokaler
Doppelklick-Start stehen in [classroom.md](classroom.md). Eine feste HTTPS-Adresse
ist mit der [Hosting-Vorbereitung](hosting.md) und `render.yaml` vorbereitet;
ein Hosting-Dienst wurde noch nicht angelegt.

GitHub Pages und das Öffnen einer lokalen HTML-Datei führen den Anmeldeserver
nicht aus. Ohne Server erklärt die Startseite den Offline-Modus und bietet
den eigenständigen Editor an; Spiel und Editor lassen sich weiterhin direkt
öffnen. Das ZIP `nebeljagd-welt-und-editor.zip` ist ein Offline-Paket und richtet
keinen Schulserver ein.

## Aktuellen Browserstand bauen

`npm run build` erzeugt den vollständigen Browserstand in `dist/` und
synchronisiert ihn automatisch nach `welt/`:

- `welt/index.html`: Startseite mit Schüler- und Lehrkraftzugang.
- `welt/teacher.html`: Lehrkraftbereich mit Codeverwaltung und Editor-Link.
- `welt/lobby.html`: Einstieg in die Übungswiese nach Anmeldung.
- `welt/map-editor.html`: aktueller eigenständiger Editor.
- `welt/nebeljagd.html`: eigenständiges Spiel, auch für Editor-Spieltests.
- `welt/nebeljagd-welt-und-editor.zip`: Browserdateien, Kartendaten und Anleitung.

`welt/index.html` ist in diesem neuen Stand die Startseite. Sie darf beim
Veröffentlichen nicht durch eine Kopie des Spiels ersetzt werden. **In 3D testen**
öffnet aus dem gebauten Editor `nebeljagd.html?mapSource=editor` und übergibt den
Entwurf. In Vite wird stattdessen `game.html?mapSource=editor` verwendet.

`welt/release.json` enthält die Build-Kennung sowie Größen und SHA-256-Werte
aller erzeugten Dateien. Der Lehrkraftbereich verlinkt den Editor dieses
Serverstands und zeigt dessen Erstellungszeit. Der Schulserver liefert die
HTML-Dateien ohne Browsercache aus.

## Aktualisieren und bereitstellen

Die URLs bleiben bei Aktualisierungen desselben Serververzeichnisses gleich.
Nach Quellcodeänderungen Tests und `npm run build` ausführen, dann die erzeugten
Dateien prüfen. Ein lokaler Build aktualisiert `welt/` in der Arbeitskopie;
er überträgt die Dateien nicht automatisch auf andere Rechner oder ins Internet.

Der Workflow `work-build-check.yml` prüft und übernimmt den vollständigen Build
in das Repository auf `work`. Dieser Schritt allein veröffentlicht keinen
Schulserver. Historische Gras-Patch-Workflows erzeugen Prüfartefakte und
überschreiben keine aktuellen `welt/`-Dateien mehr. Nach eingerichteter
GitHub-Anbindung kann der Hosting-Dienst die Quellen auf `work` neu bauen;
Einrichtung, Speicher und Aktualisierungsverhalten stehen in [hosting.md](hosting.md).

Eine Veröffentlichung auf `main` oder einem öffentlichen Server ist ein eigener
Bereitstellungsschritt. Den vollständigen aktuellen Stand übertragen und
`index.html` als Startseite erhalten; den Editor-Spiel-Übergang und beim
Schulserver beide Anmeldewege auf der tatsächlichen Adresse prüfen. Eine
statische Pages-Veröffentlichung kann weiterhin Spiel und Editor anbieten,
führt aber die Klassen-Anmeldung nicht aus.

Browseränderungen im Editor müssen weiterhin als JSON gespeichert und für einen
neuen Projektstand als `worldmap.json` übernommen werden. Sie ändern die
veröffentlichte Ausgangskarte nicht automatisch.

## Bestehende öffentliche Vorschau

Die veröffentlichte Ausgabe liegt unter einem stabilen GitHub-Pages-Pfad auf
`main`. Dessen `preview/`-Dateien sind von den neuen Klassenserver-Dateien in
`welt/` auf dem Entwicklungsbranch getrennt:

- [Spiel](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/nebeljagd.html)
- [Spieleinstieg](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/)
- [Aktueller Editor](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=476f9d0)

Der veröffentlichte Ordner `preview/` enthält den eigenständigen Build und
Kartendaten. Die Quelldateien und die fortlaufende Entwicklung bleiben auf
`work`. Der [ZIP-Download aus work](https://github.com/ohnoyoudie-dotcom/nebeljagd/raw/refs/heads/work/welt/nebeljagd-welt-und-editor.zip)
enthält jeweils den dort eingecheckten Browserstand; lokale Änderungen sind
vor einer Übernahme auf diesen Branch darin noch nicht enthalten.

## Bereinigte Vier-Biome-Karte · vorherige Ausgabe vom 1. November 2026

Diese vorherige Ausgabe wurde im öffentlichen Vorschauordner bereitgestellt:
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


## Ältere Veröffentlichung unter welt/

Die folgenden GitHub-Pages-Adressen verwenden weiterhin `main` und wurden durch
die neue Klassenportal-Vorbereitung nicht aktualisiert:

- [Älterer Spieleinstieg](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/)
- [Älterer Editor](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/map-editor.html)
- [Älteres Offline-Paket](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/nebeljagd-welt-und-editor.zip)

Der erste veröffentlichte Stand wurde mit Commit `c79e642` auf `main` unter
`welt/` ergänzt. Commit `63d2a73` aktualisierte diese Dateien um taktische Sicht,
Truhen, Gold, Seltenheiten und Elementarwaffen. GitHub Pages verwendet `main`
und den Repository-Stamm. In diesen älteren Ausgaben war `index.html` eine
Spielkopie; diese damalige Zuordnung gilt nicht für das neue Klassenportal.

Die nachfolgenden Angaben dokumentieren frühere Veröffentlichungen und gelten
nicht als Prüfung des neuen Klassenportals:

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

Ein späterer Schattenbuild speichert Sichtentfernungen mit Half-Float-Präzision
und nutzt einen dichteren 17-Punkt-Gaußfilter. Das reduziert sichtbare
Entfernungsstufen an langen Hindernisschatten. Der 50-Prozent-Schwarzwert bleibt
erhalten. Der Build wurde mit 127 Node-Tests und einem lokalen WebGL-Browserlauf
ohne Shader- oder Konsolenfehler geprüft.

Der folgende Sichtbuild skaliert die Winkelweichzeichnung mit der Entfernung,
damit Hindernisschatten auch in der Ferne ihre dunkle Deckkraft behalten. Truhen,
Waffen und Sammelgegenstände erscheinen nur noch bei freier Sicht; das Gelände
und die übrige Umgebung bleiben sichtbar.

# Bedienung und Darstellung: aktuelles Verbesserungspaket

Die bestehende Welt, alle gespeicherten Objektpositionen und alle Originalmodelle
bleiben erhalten. Dieses Paket verbessert acht Punkte; neue Spielfigur/echte
Vorwärtsrolle, Multiplayer und Shops sind getrennt in `next-packages.md` vorgemerkt.

## Modelle und Editor

Alle 24 vorhandenen Objektvarianten sind in `src/map/asset-catalog.js` ihrer
wirklichen Quelle zugeordnet. Palette und Objekteigenschaften zeigen echte
Vorschaubilder aus dem Laufzeitrenderer, keine frei erfundenen Ersatzbilder.
Die eingebetteten WebPs benötigen keine Netzverbindung. `asset-inventory.md`
führt die Quellen auf; `missing-assets.md` sammelt gezielt spätere Grafikpakete.

Im Editor aktiviert **Graspinsel** das Malen hoher Grasflächen per Maus oder
Finger. Der Radius lässt sich einstellen. Lange Zeigerbewegungen werden mit
regelmäßigen Abständen gefüllt; wiederholtes Übermalen häuft nicht ständig neue
Objekte an. Ein kompletter Strich ist ein Undo-Schritt. Abbruch verwirft den
unfertigen Strich. Die Ausgabe bleibt eine Liste gewöhnlicher `grass`-Objekte
mit Variante `tall`, Position und Radius in `worldmap.json`; jedes Objekt lässt
sich danach separat bearbeiten. Inselgrenze und Objektobergrenze werden geprüft.

Die Halme des hohen Grases sind bei Skalierung 1 zwischen 2,25 und 2,60 Meter
hoch. Sie wehen leicht und werden beim Betreten nicht zur Seite gedrückt. Die
Verbergungslogik und die lokal noch erkennbaren Kopf-/Schulterpartien bleiben.

## Sicht, Bewegung und Karte

Der taktische Nebel ist hellgrau mit leichtem Blauanteil und lässt 42 Prozent
der ursprünglichen Szenenfarbe durch. Gebäude, Landschaft und Bodenbeute bleiben
sichtbar. Gegner, Namen, Lebensbalken und Schadenszahlen hinter Hindernissen oder
außerhalb der 18 Meter Sichtweite werden weiterhin vollständig verborgen.
Durchscheinende Beute lässt sich nicht durch Wände aufnehmen. Der giftige,
schrumpfende Zonenrand bleibt ein eigenes lila System.

`locomotion.js` glättet nur die Darstellung: Ganggeschwindigkeit, Ein-/Ausblenden
der Laufanimation, kürzeste Drehung und leichte Gewichtsverlagerung. Die
Spielgeschwindigkeit und Kollisionsregeln bleiben unverändert. Die neue Figur
mit eigener in Blender animierter Vorwärtsrolle ist noch nicht eingebaut.

Die Minikarte ist am Desktop 240, auf Tablets 200 Pixel breit und auf kleinen
Bildschirmen angepasst. **Umgebung** zeigt einen 160-Meter-Ausschnitt; **Insel**
zeigt die gesamte Karte. Eigene Position und Blickrichtung, Hausgrundrisse,
Ortszeichen und ein Maßstab machen sie lesbar. Dynamische Beutemarker erscheinen
nur bei tatsächlichem Sichtkontakt; bekannte Landschaft und Orte bleiben als
Übersicht erhalten. Enge Querformate verwenden eine kompaktere Anordnung.

## Aufheben und Trefferfeedback

Ohne Waffe wird ein gelandeter, erreichbarer Fund in 1,1 Metern Nähe automatisch
aufgenommen. Mit Waffe wird niemals automatisch gewechselt; **E** beziehungsweise
die Aktionstaste bleibt der bewusste Wechsel. Pause, Rollen, Hindernisse, fehlender
Sichtkontakt und noch fliegende Beute verhindern die automatische Aufnahme.

Jede Waffenstufe verwendet dieselbe Farbe für Körperleuchten, Akzente, weichen
Bodenhalo und Anzeige. Auch aus Truhen ausgeworfene Waffen behalten diese Stufe.
Herzen und Münzen besitzen keine Seltenheit und behalten ihre Zweckfarben.
Zusätzliche Punktlichter oder ein teurer Bloom-Pass sind dafür nicht nötig.

Der tatsächliche Lebenswert ändert sich synchron beim Treffer. Ein kurzes
Aufleuchten und ein weich sinkender Füllstand machen die Änderung anschließend
sichtbar. Aufsteigende Zahlen zeigen den tatsächlich abgezogenen Schaden.
Brandschaden und Zonenschaden werden über 350 Millisekunden für lesbare Zahlen
zusammengefasst; diese Zusammenfassung verzögert nicht den Schaden selbst.

`damage-feedback.js` nutzt einen festen Pool mit 32 Zahlen und einem gemeinsamen
Glyphenatlas. Zahlen und Balken benötigen jeweils einen instanzierten Draw Call.
Verdeckte Effekte werden verworfen und erscheinen beim Wiedersehen nicht erneut.
Pause friert die Darstellung ein; Neustart räumt sie auf.

## Prüfung und Auslieferung

Node-Tests prüfen unter anderem Pinselinterpolation, Randfälle, Quellenzuordnung,
automatische Aufnahme, Seltenheitsmaterialien, unmittelbare Gesundheit und
zeitabhängiges Feedback. Produktions-Browserprüfungen:

```sh
npm test
npm run verify:assets
npm run map:check
npm run build
# npm run preview läuft auf dem gewählten Port:
NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/polish_game_smoke.py
NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/grass_brush_smoke.py
```

Zusätzliche Berichte: `polish-vision-check.json`, `polish-motion-check.json`,
`minimap-ui-check.json`, `weapon-glow-check.json`. Die Online-Auslieferung wird
in `public-delivery-check.json` getrennt nachgewiesen. Software-WebGL im
Testbrowser ist kein Leistungsnachweis für ein physisches Schul-iPad.

Der vorherige Stand bleibt unverändert als
`public/versions/nebeljagd-sicht-und-truhen-v014.html` archiviert.

Abschließend bestanden 80 Node-Tests, sieben Spielabläufe im Produktionsbrowser
und neun Graspinsel-/Editorabläufe einschließlich echter 3D-Übergabe. Beide
eigenständigen HTML-Dateien starten mit gesperrten HTTP/S-Anfragen. Der Build
wurde mit Commit `4b5812a` unter den bestehenden Pages-Adressen veröffentlicht.

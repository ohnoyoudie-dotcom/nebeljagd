# Nebeljagd · Die Nebelinsel

**Entwicklungsstand auf `work`:** Der bestehende Editor enthält jetzt
Vegetations-, Boden-, Streu- und Biompinsel, globale und lokale Windsteuerung
sowie eine animierte Vegetationsvorschau. Höhe, Dichte, Farbwerte und eigene
Vorlagen werden mit der Karte gespeichert. Anleitung und Prüfgrenzen:
[`docs/landscape-tools.md`](docs/landscape-tools.md).
Die bestehende Veröffentlichung auf `main` bleibt auf dem vorherigen Stand.
Der neue Stand ist als [Entwicklungspaket zum Herunterladen](https://github.com/ohnoyoudie-dotcom/nebeljagd/raw/refs/heads/work/development/nebeljagd-welt-und-editor.zip)
verfügbar: entpacken und `map-editor.html` oder `nebeljagd.html` öffnen.

Nebeljagd ist ein spielbarer 3D-Fantasy-Prototyp für den Browser. Die große Insel
wird jetzt direkt aus [`worldmap.json`](worldmap.json) erzeugt: rund **1,125 km²**
Land mit sieben Landschaften, Wegen, zwei Flüssen, Brücken und Dörfern. Der
Blender-Waldläufer, Bogen, Schwert, Sammelgegenstände, Versteckgras und begehbare
Häuser aus dem bisherigen Spiel bleiben Teil der Welt.

Der [Karteneditor](map-editor.html) bearbeitet dieselben Daten. Bäume, Häuser,
Blumenbeete, Grasflächen, Felsen, Sträucher, Ruinen, Schreine und Gegenstände
lassen sich anlegen, verschieben, drehen, skalieren, duplizieren und löschen.
**„In 3D testen“** öffnet den aktuellen Entwurf im Spiel. Varianten zeigen echte
Modellvorschauen; der **Graspinsel** malt bearbeitbare Versteckflächen. Der
**Radiergummi** entfernt ganze Objekte oder gezielt Grasflächen mit einem Strich.

Die Ausgangskarte enthält 4.020 gespeicherte Weltobjekte, darunter 2.601 Bäume,
31 Häuser, 48 Truhen, 741 Grasflächen, 125 Blumenbeete und vier bewachsene
Felskanten beziehungsweise Felskuppen. Zehn Startbereiche bieten Platz
für die spätere Planung mit etwa 50 Spielern. Der aktuelle Spielstand ist ein
**lokaler Erkundungs- und Kampfprototyp** mit drei beschrifteten Übungsgegnern;
Multiplayer, Teams und Schreinfragen sind noch nicht aktiv.

Bedienung und Datenformat: [`docs/worldmap.md`](docs/worldmap.md).
Aufbau der generierten Welt: [`docs/generated-world.md`](docs/generated-world.md).
Aktuelle Bedienungsverbesserungen: [`docs/world-polish.md`](docs/world-polish.md).
Gras und Gelände nach der Bildreferenz: [`docs/grass-restoration.md`](docs/grass-restoration.md)
und [`docs/reference-terrain.md`](docs/reference-terrain.md).
Vorgemerkte Pakete: [`docs/next-packages.md`](docs/next-packages.md).

Öffentliche Version auf `main` (ohne die neuen Landschaftswerkzeuge):
[Spiel](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/) ·
[Editor](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/map-editor.html) ·
[ZIP herunterladen](https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/nebeljagd-welt-und-editor.zip).
Bereitstellung und Aktualisierung: [`docs/browser-delivery.md`](docs/browser-delivery.md).

## Starten und Bauen

Voraussetzung: Node.js ab **22.12.0** und npm.

```sh
npm ci
npm run dev
```

Die Serveradresse öffnet das Spiel; `/map-editor.html` öffnet den Editor. Für
ein iPad im selben Netzwerk die Netzwerkadresse des Entwicklungsrechners
verwenden. Der Entwicklungsserver bindet bereits an alle Netzwerkschnittstellen.

```sh
npm test              # Spielregeln, Kollisionen, Karten, Weltgeometrie und Loot
npm run verify:assets # Importdateien, GLB-Budgets und erhaltene Versionen
npm run map:check     # Kartendaten und Übereinstimmung der SVG prüfen
npm run build         # Produktionsdateien in dist/
npm run preview       # Fertigen Build lokal prüfen
```

Die Landschaftsdaten sind eine optionale, separat versionierte Erweiterung
`landscape.version = 1`. Alte Karten bleiben gültig; bestehende Objekte erhalten
erst beim Bearbeiten neue `vegetation`-Eigenschaften. Die Ausgangskarte und ihre
4.020 Platzierungen werden durch die neuen Werkzeuge nicht automatisch verändert.

Ein Produktionsserver muss nur `dist/` ausliefern. Relative Pfade unterstützen
Hosting unter einem Unterverzeichnis. Der Build erzeugt außerdem zwei
Einzeldateien mit eingebettetem JavaScript, CSS und allen benötigten Modellen:

- **`dist/nebeljagd.html`**: Spiel direkt im Browser öffnen.
- **`dist/map-editor.html`**: Editor direkt im Browser öffnen.

**`dist/nebeljagd-welt-und-editor.zip`** bündelt beide HTML-Dateien, Kartendaten,
SVG, Schema und eine kurze Anleitung. Das ZIP entpacken und die Dateien im
gemeinsamen Ordner lassen.

Für „In 3D testen“ bei lokal geöffneten Dateien beide HTML-Dateien in denselben
Ordner legen. Alternativ im Editor JSON speichern und im Spiel über **„Eigene
Karte laden“** öffnen. Normales Spielen und Bearbeiten benötigen keine externen
Grafikdienste, Zugangsdaten oder heruntergeladenen Schriftarten. Die Quelldateien
`index.html` und `map-editor.html` benötigen hingegen Vite oder den Build.

Browseränderungen werden lokal gespeichert und überschreiben keine Projektdatei.
Für einen dauerhaften Projektstand die exportierte Datei als `worldmap.json`
übernehmen und neu bauen. SVG-Änderungen werden nicht automatisch nach JSON
zurückübersetzt. `npm run build` lässt die manuell bearbeitbare SVG im
Projektstamm unverändert; **`npm run map:export` ersetzt sie ausdrücklich** aus
JSON. `dist/worldmap.svg` wird bei jedem Build aus den aktuellen Daten erzeugt.

## Steuerung und Welt

- **PC:** WASD/Pfeile bewegen, Leertaste rollen, **E** Waffe wechseln oder Truhe öffnen, **F**
  schießen oder schlagen, Esc pausieren. **Touch:** Joystick und Aktionstasten.
  Ohne ausgerüstete Waffe wird ein erreichbarer Fund beim Darüberlaufen automatisch aufgenommen.
- Start bei Auenwacht, Koordinaten `[30, -42]`, mit 72 von 100 Lebenspunkten.
  Herzen heilen bis zu 25 Punkte. Truhen werfen Gold und Waffen aus; Münzen
  werden beim Darüberlaufen eingesammelt.
- Die sichere Zone startet mit **800 Metern Radius**. Nach drei Minuten beginnt
  die erste Schrumpfphase. Fünf Phasen führen in insgesamt 20 Minuten auf
  20 Meter Radius. Der Nebel verursacht derzeit 11 Schadenspunkte pro Sekunde.
- Flüsse werden über die gespeicherten Brücken überquert. Bäume, Felsen,
  bewachsene Erhöhungen, Hauswände, Wasser und Küste begrenzen die Bewegung. Pfeile prüfen ihre gesamte
  Flugstrecke gegen Hindernisse und prallen gedämpft ab.
- Häuser sind dauerhaft ohne Dach und zeigen Wohnraum und zwei Schlafzimmer.
  Drehung und Größe aus dem Editor gelten auch für Boden, Eingang und Kollision.
- Hohes Gras verbirgt die Figur teilweise; die lokale Darstellung blendet auf
  45 % Deckkraft. Der Status für spätere Verbergung gegenüber anderen Spielern
  ist vorbereitet, aber noch keine Netzwerkfunktion.

- Ein taktischer Sichtradius von 18 Metern begrenzt den Blick. Wände, Felsen und
  Baumstämme verdecken Figuren dahinter. Heller graublauer Nebel lässt die
  Landschaft und Gegenstände durchscheinen; Interaktion benötigt weiter Sichtkontakt. Die lokale Minikarte bleibt
  eine schematische Übersicht; sie verrät keine verdeckten Gegner.
- Fünf Waffenstufen: Normal (grau), Gewöhnlich (weiß), Ungewöhnlich (grün),
  Selten (blau), Legendär (orange). Höhere Stufen verursachen mehr Schaden.
- Feuerstäbe entzünden Ziele für drei Sekunden; Eisstäbe halbieren ihre Bewegung
  für 2,5 Sekunden. Drei bewegliche **Übungsgegner** beim Start erlauben Tests.
- Lebensbalken stehen über den Figuren; Treffer lassen sie kurz aufleuchten
  und zeigen aufsteigende Schadenszahlen. Die Lebenswerte ändern sich sofort.
  Verdeckte Gegner verraten sich auch nicht durch ihren Balken oder Schadenszahlen. Wolkenschatten ziehen über Gelände und Gebäude.

Die größere Minikarte schaltet zwischen Umgebung und gesamter Insel um.
Die vorhandene Figur blendet Stand und Gang weicher und dreht sich fließender.
Hohes Gras ist bei Standardskalierung 2,25–2,60 Meter hoch und verwendet wieder
die dichten, breiten Büschel aus dem früheren Walddorf. Hauptwege tragen graues
Natursteinpflaster; Nebenwege bleiben Erdpfade. Bewachsene Felskanten und
Felskuppen blockieren Bewegung, Rollen, Pfeile und die Sicht auf Figuren dahinter.

Sicht, Beute und Statuswerte: [`docs/tactical-combat.md`](docs/tactical-combat.md).
Neue Modelle in [`assets/inbox/`](assets/inbox/README.md) ablegen oder im Chat
hochladen und den Einsatzzweck nennen. Das Ablegen allein importiert sie noch
nicht in den Objektkatalog.

Die Karte ist groß und noch grob ausgestaltet. Das Verhältnis von Erkundung,
Begegnungen und Nebeldruck muss mit späterem Multiplayer getestet werden.

## Technik und Assets

`src/main.js` verbindet Eingabe, Kamera und Spielablauf. `generated-world.js`
erzeugt Küste, Gelände, Wege, Wasser und Brücken aus der Karte;
`generated-spatial.js` enthält die gemeinsame räumliche Berechnung.
`world-object-renderer.js` setzt die gespeicherten Objekte um. Der Katalog in
`src/map/objects.js` verbindet Editorvarianten und Spielmodelle. `runtime-document.js`
übernimmt Editor-Entwürfe und importierte JSON-Dateien. Charakter, Häuser,
Waffen, Gesundheit und Oberfläche verwenden die bestehenden Module weiter.

Das Gelände und die Objektgruppen sind räumlich gegliedert. Entfernte Abschnitte
werden ausgeblendet; die komplette Karte wird beim Start aufgebaut. Dies ist
noch kein Nachladen und Entladen von Weltabschnitten. Instanzierte Vegetation,
Detailstufen und `?quality=low` begrenzen die sichtbare Last. **30 FPS auf
Schul-iPads sind ein Ziel, kein gemessener Gerätebefund.** Die tatsächlichen
iPads und Safari müssen gesondert geprüft werden.

Der eigene Waldläufer liegt als `assets/characters/ranger.blend` und `ranger.glb`
vor: 18 Gelenke, Skinning, Idle-/Walk-Clips und etwa 10.100 Dreiecke. Blender
wird zum Spielen und Bauen nicht benötigt. Gebäude und Grundvegetation sind
prozedurale Projektquellen. Die hochgeladenen Rei-Bäume, Büsche und Blumen sind
weiter eingebunden, unter anderem nahe Auenwacht. Unveränderte Quelldateien,
Herkunft und Materialanpassungen: [`assets/imported/rei/`](assets/imported/rei/README.md).
Die hochgeladene Rei-Gras-GLB enthielt keine Halme; die sieben Pinseltypen
verwenden deshalb Projektgeometrie. Das vorhandene Nebeljagd-Umwelt-Kit ergänzt
echtes GLB-Gras, vier Bäume einschließlich einer Herbsteiche, zwei Felsen,
Mauer, Zaun, Ruinenbogen, Fachwerkhaus und Dekokiste. Alle 38 Katalogvarianten
haben echte Modellvorschauen. Die Kit-Quelldateien bleiben unverändert.

## Prüfen und frühere Stände

Die aktuelle Prüfung für Sicht, Kampf und Beute verwendet Python Playwright und Chromium:

```sh
# Während npm run preview auf Port 4173 läuft:
python3 tests/polish_game_smoke.py
python3 tests/grass_brush_smoke.py
python3 tests/loot_editor_smoke.py
# Aktueller Gelände-/Radiergummi-Stand, Preview auf Port 4174:
NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/reference_world_smoke.py
NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/object_eraser_smoke.py
# Landschaftswerkzeuge und bestehende Umwelt-Kit-Modelle:
NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/landscape_editor_smoke.py
NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/landscape_game_smoke.py
NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/environment_kit_smoke.py
```

`?inspect=1` aktiviert eine Positionierungshilfe für reproduzierbare Aufnahmen;
normale Spielsitzungen enthalten diese Funktion nicht. Berichte und Aufnahmen
liegen unter `test-results/` und werden für die Dokumentation übernommen.
Die älteren `browser_smoke.py`, `village_smoke.py`, `combat_smoke.py` und
`imported_assets_smoke.py` verwenden teilweise Walddorf-Koordinaten und belegen
diese früheren Ausbaustände. Frühere Karteneditor-Prüfungen stehen in
`worldmap_smoke.py`; bei Geometrieprüfungen die Weltobjekte-Ebene ausblenden.

Der vorherige Graspinselstand bleibt als
`public/versions/nebeljagd-graspinsel-v015.html` erhalten.
Der vorherige Gelände-/Radiergummistand bleibt zusätzlich als
`public/versions/nebeljagd-gelaende-v016.html` erhalten.
Der vorherige Sicht-/Truhenstand bleibt als
`public/versions/nebeljagd-sicht-und-truhen-v014.html` erhalten.
Die vorherige große Insel bleibt als `public/versions/nebeljagd-grosse-insel-v013.html`
erhalten. `generated_world_smoke.py` und sein Bericht dokumentieren diesen Stand.
Das frühere Walddorf bleibt unverändert als
[`public/versions/nebeljagd-walddorf-v012.html`](public/versions/nebeljagd-walddorf-v012.html)
erhalten. Der ältere 3D-Stand `nebeljagd-3d-v011.html`, sein Quellenarchiv und die
ursprünglichen 2D-Dateien bleiben ebenfalls erhalten. Ihre Prüfsummen stehen in
`archive/preserved-versions.json`; der Build liefert die HTML-Versionen unter
`dist/versions/` aus. Die Berichte und Aufnahmen in `combat-and-map-update.md`,
`imported-rei-assets.md` und den bisherigen Walddorf-Dokumenten beschreiben diese
historischen Stände.

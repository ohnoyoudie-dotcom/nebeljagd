# Hochgeladenes Feuerprojektil des Feuerstabs

Der Feuerstab verwendet `assets/inbox/fiery flame 3d model.glb` als sichtbares
Feuerprojektil. Das Original bleibt unverändert; seine SHA-256 lautet
`48be7b6326161097ac628d6d52cede7a3c1f202a3e7a3309741d4144ece02f65`.

Die getrennte Browserableitung liegt in
`assets/imported/tripo-fireball/runtime/fireball.glb`: 6.000 Dreiecke,
459.288 Bytes, drei eingebettete Materialtexturen bis 512 Pixel. Prüfwerte,
Quellbezug und Aufbereitung stehen in `inspection.json`; `preview.png` ist
eine tatsächliche Blender-Aufnahme der Ableitung. Das Modell wird im Spiel
auf 0,75 Meter Länge zentriert und von seiner Quellrichtung +X nach +Z gedreht.
Geometrie und Texturen werden pro Schuss geteilt; die animierten Materialien
werden pro Projektil geklont.

Der Materialshader bewegt das warme Leuchten mit der Simulationszeit.
Flammenzungen, Funken und ein weicher orangefarbener Glühsaum ergänzen das Modell.
Die dichtere, normal geblendete Rauchspur steigt leicht auf und blendet weich aus.
Ein fester Pool von 64 Rauchpartikeln begrenzt die Zahl der Szenenobjekte.
Treffer auf Figuren und Wände erzeugen zehn größere Rauchpuffs, 38 Funken,
einen hellen Impuls und eine größere expandierende Feuerwolke. Pause friert die
Effekte ein; Sichtnebel verdeckt sie an ihrer tatsächlichen Position;
Neustart räumt alle aktiven Effekte auf. Eis verwendet weiterhin ausschließlich
seinen Kristall, Frostschweif und die ursprüngliche Verlangsamung. Schaden,
Brandschaden, Projektilgeschwindigkeit und Kollisionen wurden nicht verändert.

Die Aufbereitung verwendet den bestehenden lokalen Blender-Ablauf, da die
`game-dev`-CLI hier nicht installiert ist. Sie ist kein kanonisches
Game-Development-Studio-Paket, ruft keinen Anbieter auf und behauptet keine
unabhängig geprüften kommerziellen Nutzungsrechte.

Aufbereitung in ein neues Ziel, ohne das Original oder vorhandene Ausgaben zu
überschreiben:

```sh
python3 scripts/prepare-tripo-fireball.py
blender -b -t 3 --python scripts/prepare-tripo-fireball.py -- --execute
```

Der erste Aufruf zeigt nur den Plan. Der zweite benötigt die Freigabe für die
konkrete Aufbereitung und erstellt Browserdatei, Prüfbericht und Vorschau.
Eine nach gültigem Export fehlgeschlagene erste Vorschau kann mit demselben
Befehl fortgesetzt werden; eine abgeschlossene Ausgabe wird abgelehnt.

Prüfen und Browserdateien gemeinsam erzeugen:

```sh
npm test
npm run verify:assets
npm run build
# Bei laufendem npm run preview auf Port 4174:
python3 tests/fireball_browser_smoke.py
python3 tests/online_editor_smoke.py
```

Der spezielle Browsertest prüft das tatsächliche Modell im erzeugten Spiel,
Shader-Fehler, Funken/Rauch, Pause, Treffer/Brandschaden, Neustart und die
Abgrenzung zum Eisstab. Berichte und Aufnahmen liegen unter
`test-results/fireball/` und werden im GitHub-Workflow als Prüfartefakt gesammelt.

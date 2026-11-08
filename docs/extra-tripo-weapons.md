# Giftstab, Mondstab und verzierter Bogen

Die drei Inbox-Modelle sind als platzierbare, aufhebbare und benutzbare Waffen
eingebunden. Der aktuelle Branch-Build steht als
[Browserpaket aus work](https://github.com/ohnoyoudie-dotcom/nebeljagd/raw/refs/heads/work/welt/magebrawl-welt-und-editor.zip)
bereit. Entpacken, `map-editor.html` öffnen und über **Spielen** testen.
Der [feste Editor-Weblink](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/editor.html)
wird nach erfolgreichen Prüfungen über `main/preview` aktualisiert.

| Objektart | Variante | Original in assets/inbox |
| --- | --- | --- |
| Giftstab | kit-tripo-poison-staff | Poison staff 3d model.glb |
| Mondstab | kit-tripo-moon-staff | Moon staff 3d model.glb |
| Bogen | kit-tripo-ornate-bow | ornate bow 3d model.glb |

Die Originale enthalten jeweils etwa 1,9 Millionen Dreiecke. Der
lokale Blender-Import erzeugt getrennte Browserableitungen unter
`assets/imported/tripo-extra-weapons`. Die Originale, die bisherigen drei
Tripo-Waffen und die verfasste `worldmap.json` bleiben unverändert.

## Ausgeführter Import

Eine reine Prüfung ohne Asset-Schreibvorgang:

```sh
python3 scripts/prepare-tripo-extra-weapons.py --plan
```

Mit Freigabe des Nutzers wurde dieser konkrete Aufruf ausgeführt:

```sh
blender -b -t 3 --python scripts/prepare-tripo-extra-weapons.py -- --execute
```

Der Aufruf liest die drei per SHA-256 gepinnten Originaldateien und schreibt
nur in das neue Zielverzeichnis. Ein bereits vorhandenes Ziel wird abgelehnt.
Die Grenzen sind 12.000 Dreiecke und 1,5 MiB pro GLB, Farb-/Materialtexturen
bis 1024 Pixel und Normal-Maps bis 768 Pixel. Die Stäbe werden 1,70 Meter lang,
der Bogen 1,35 Meter. Die sichtbare Griffmitte liegt am Ursprung.

| Modell | Dreiecke | GLB-Größe |
| --- | ---: | ---: |
| Giftstab | 11.999 | 1.369.084 Bytes |
| Mondstab | 12.000 | 1.323.228 Bytes |
| Verzierter Bogen | 11.996 | 1.245.276 Bytes |

Der Bogen behält seine Quellachsen und gekrümmten Wurfarme. Er erhält einen
separat gemessenen Griff und Sehnenanker; seine Originalsehne bleibt erhalten.
Im Spiel wird nur die Geometriekopie des gehaltenen Bogens gespannt. Die
Grundmodelle und auf dem Boden liegende Bögen teilen diese Verformung nicht.

Der Projektimport nutzt die vorhandene Blender-Aufbereitung, da die allgemeine
`game-dev`-CLI hier nicht verfügbar ist. Die abgeleiteten Dateien sind kein
kanonisches Game-Development-Studio-Paket. Provenienz, Quellprüfsummen,
Dateibestand und lokale Prüfberichte werden getrennt festgehalten. Es werden
keine Anbieter aufgerufen oder kommerzielle Lizenzbelege behauptet.

## Benutzung

Die Modelle stehen unter
**Objekte → Einzeln** zur Verfügung. Sie lassen sich platzieren, drehen,
skalieren, mit Seltenheit versehen und als JSON speichern. Ältere Waffen und
Kartenvarianten bleiben lesbar. Der gemeinsame Projektkartenstand wird dabei
nicht automatisch um zusätzliche Platzierungen ergänzt.

Unbewaffnete Spieler nehmen erreichbare Waffen automatisch auf. **E** wechselt
die Waffe und legt die bisherige an der Fundstelle ab. **F** greift an:

- Giftstab: Maustaste auf dem Spielfeld oder die Angriffstaste halten, den
  Zielkreis bewegen und loslassen. Mit F halten lässt sich über den Mauszeiger
  zielen. Auf Touch-Geräten die Angriffstaste halten und ziehen. Reichweite:
  zwölf Meter; Wolkenradius: 2,4 Meter. Die Wolke besteht drei Sekunden und
  schädigt erreichbare Gegner im Bereich. Mauern blockieren Projektil und
  Wolkenschaden. Abbrechen, Rollen oder Pausieren verwirft ein gehaltenes Ziel.
- Mondstab: eine sichtbare 3D-Sichel durchdringt Gegner, trifft pro Flugweg jeden
  Gegner höchstens einmal und kehrt nach Mauerkontakt oder zwölf Metern zurück.
  Weitere Angriffe und Waffenwechsel sind bis zur Rückkehr gesperrt.
- Verzierter Bogen: gespannte Originalsehne und ein 3D-Pfeil mit Holzschaft,
  metallener Spitze und drei räumlichen Federn.

Neue Stabtypen verlangen die tatsächlichen geladenen Modelle; ihre zufälligen
Truhenfunde werden nicht durch prozedurale Ersatzmodelle dargestellt.

## Prüfung

Die echten Blender-Vorschaubilder sind im Katalog registriert. Die
Prüfbefehle für das vollständige Paket lauten:

```sh
npm test
npm run verify:assets
npm run map:check
npm run build
python3 tests/online_editor_smoke.py
NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/tripo_weapon_editor_smoke.py
```

Der letzte Test benötigt einen laufenden Preview-Server auf Port 4174. Er
prüft alle sechs Tripo-Waffen in den erzeugten Browserdateien einschließlich
Editorübergabe, echten GLB-Modellen, Aufheben, Wechseln, Neustart und Treffern.
Der gemeinsame Veröffentlichungsablauf führt diese Waffenprüfung vor jeder
Bereitstellung erneut aus und liefert Editor und Spiel gemeinsam aus.

Lokal bestanden: 429 Projekttests, Asset- und Kartenprüfung, Produktionsbuild,
alle acht Prüfungen des festen Editor-Einstiegs sowie 14 Browserprüfungen für
die sechs Waffen. Die drei neuen Waffen trafen Übungsgegner; der Giftstab
verursachte anschließend weiteren Giftschaden. Die gemessene Abweichung
zwischen Griff und Handfläche betrug bei allen drei Modellen null.
Die Bogenbenennung wurde danach separat korrigiert und mit 36 relevanten Tests
geprüft. Der Browserlauf verwendet Chromium/SwiftShader über lokales HTTP;
er ist kein Leistungsnachweis auf einem physischen Mobilgerät.

Die Dateien im Importpaket dokumentieren den Stand der Modellaufbereitung.
Spätere Spielprüfungen stehen getrennt in `test-results/tripo-weapons/` und
werden im Veröffentlichungsworkflow als Prüfartefakt aufbewahrt. Die
ursprünglichen Aufbereitungsbelege werden nicht nachträglich umgeschrieben.

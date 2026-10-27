# Gezielte Rei-Asset-Integration

Die vier Nutzer-Uploads bleiben bytegenau unter `assets/imported/rei/source/`
erhalten. SHA-256-Werte und Größen stehen in `source-manifest.json`. Es lagen
keine separaten Lizenz-/Urhebernachweise bei; die Herkunft wird als Nutzer-Upload
dokumentiert, ohne daraus eine öffentliche Lizenz oder eigene Urheberschaft
abzuleiten. Der Nutzer hat die lokale Integration dieser Dateien angefordert.

## Tatsächlich verwendete Inhalte

| Quelle | Verwendung |
| --- | --- |
| Rei_treeLeavesGN.glb | Ein ausgewähltes Baum-Paar aus Krone und Stamm im Garten westlich von Mooswinkel. |
| Rei_treeLeavesGN_samples.glb | Ein zweiter Baum und eine vereinfachte Buschvariante; Demoanordnung und Hilfsobjekte ausgelassen. |
| Rei_flowersGN_sample.blend | Drei ursprüngliche GN-Blumenprototypen realisiert und als weiße, rote und goldene Blumen in zwei Beeten instanziert. |
| grassGN3_3_v2_Rei.glb | Enthält nur Bodenfläche und Testwürfel, keine Grashalme. Die Bodenfläche dient verkleinert als weich begrenzter Beetuntergrund; der Würfel bleibt draußen. |

Die Blumen stehen am Weg unterhalb des Startbereichs und am seitlichen Garten
von Mooswinkel. Zwei importierte Bäume ersetzen zwei prozedurale Bäume, damit
die Gesamtzahl bei 34 bleibt. Vor der übrigen Landschaftsverteilung werden die
Importbereiche reserviert; Eingänge, Sammelobjekte und Laufwege bleiben frei.
Nur die beiden Stämme erhalten feste Bewegung-/Pfeilkollisionskörper. Kleine
Blumen und Sträucher sind begehbare Dekoration.

## Material- und Geometrieaufbereitung

Die Baum-GLBs enthalten keine Texturen oder Vertexfarben und überwiegend weiße
Unlit-Materialien. Die ursprüngliche Blender-/Geometry-Nodes-Blattdarstellung
ist damit nicht im GLB vorhanden. Das Spiel weist den gelieferten Kronen- und
Stammgeometrien passende eigene beleuchtete Laub-/Rindenmaterialien zu. Es werden
keine fehlenden Original-Blattgeometrien oder Shader als wiederhergestellt ausgegeben.

Die Blender-Blumen sind tatsächliche Quell-Geometrie einschließlich realisierter
GN-Instanzen. Ihre ursprünglichen RGB-/Höhenverlaufsfarben wurden in Vertexfarben
und ein PBR-Material übertragen; das Eevee-ShaderToRGB-Toon-Lichtverhalten lässt
sich nicht direkt mit glTF transportieren. Nur zu feine Blütenköpfe wurden für die
kleine Spielansicht vereinfacht, die Stiele bleiben erhalten.

Die vorbereiteten Bibliotheken umfassen 23.640 Dreiecke für Baum 1, 14.352 für
Baum 2, 3.980 für den Busch, 3.475 für alle drei Blumenprototypen und zwei für den
Beetgrund. Die Quellen bleiben unverändert. Auswahl, Normalisierung, Ableitungen
und erneute GLB-Importprüfungen stehen in `geometry-inspection.json`,
`flowers-export-report.json` und `runtime-manifest.json`.

## Reproduzierbarkeit und Browser-Build

```sh
node scripts/prepare-rei-assets.mjs /tmp/nebeljagd-rei-export
blender --background --disable-autoexec --python scripts/prepare-rei-flowers.py -- assets/imported/rei/source/Rei_flowersGN_sample.blend /tmp/nebeljagd-rei-flowers
npm run verify:assets
```

Die Vorbereitung schreibt abgeleitete Dateien in die angegebenen Ausgabeverzeichnisse.
Normale Spiel-Builds verwenden die bereits gespeicherten `runtime/*.glb` und
benötigen kein Blender. Alle GLBs werden auch in die eigenständige HTML-Version
eingebettet; Texturen werden lokal erzeugt. Es werden keine externen Assetdienste
oder fremden Zugangsdaten benötigt. Die Aufzeichnungen sind lokale Prüfbelege,
keine kanonischen `game-dev`-CLI-Paketbelege; diese optionale CLI ist hier nicht installiert.

## Geprüfter Import

Der Produktions-Browsercheck bestätigt fünf geladene GLBs mit 30 tatsächlichen
Platzierungen: zwei Bäume, zwei Sträucher, 24 Blumen und zwei Beetgründe. Die
Bounds liegen am vorgesehenen Boden; die Blumen behalten ihre Vertexfarben.
Beide importierten Stämme blockieren echte WASD-Bewegung und reale Pfeile, die
anschließend abprallen. Die gesamte Baumzahl bleibt 34, die Zahl der Tarnflächen 12.

Die Startschaltfläche bleibt während des asynchronen Welt-/Figurenimports gesperrt
und wird erst beim fertigen Spiel frei. Die Einzel-HTML-Version benötigt auch mit
allen fünf Importmodellen nur eine HTTP-Anfrage. Keine JavaScript- oder Shaderfehler
wurden im Importcheck festgestellt. [Maschinenlesbarer Bericht](imported-assets-smoke.json).

Tatsächliche Kameraaufnahmen: [Pfadblumen](screenshots/rei-path-flowers.png),
[Garten](screenshots/rei-garden.png), [Baum 1](screenshots/rei-tree01.png),
[Baum 2](screenshots/rei-tree02.png).

Auch der anschließende vollständige Dorf-Browsertest besteht alle elf Prüfungen,
inklusive Touch, Häusern, Sammeln, Nebel, Brücke und Tor, ohne JavaScript-/Shaderfehler.
Die 17 Node-Tests und die Assetprüfung (vier unveränderte Importquellen, fünf
GLB-Ableitungen und sieben frühere Versionsdateien) sind ebenfalls erfolgreich.

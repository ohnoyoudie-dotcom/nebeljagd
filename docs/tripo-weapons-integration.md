# Drei Tripo-Waffen im Editor und Spiel

Die vom Nutzer in `assets/inbox/` abgelegten Modelle sind als platzierbare
Waffen eingebunden. Im Editor **Objekte → Einzeln** öffnen, die Objektart und
Seltenheit auswählen, **Auf Karte setzen** aktivieren und auf die Karte klicken.
**＋ In die Mitte** legt die Waffe direkt in der aktuellen Kartenansicht an.

| Objektart | Modell | Datei aus Inbox |
| --- | --- | --- |
| Schwert | Schwert · Tripo | `fantasy sword 3d model.glb` |
| Feuerstab | Feuerstab (Lavastab) · Tripo | `lava crystal staff 3d model.glb` |
| Eisstab | Eisstab (Kristallstab) · Tripo | `crystal staff 3d model.glb` |

Die Vorschauen zeigen die tatsächlichen aufbereiteten Modelle. Drehung, Größe
und alle fünf Seltenheitsstufen lassen sich wie bei vorhandenen Waffen
bearbeiten und mit der Karte speichern. **Auf Tripo-Objekte bereinigen** behält
diese drei Varianten bei. Alte prozedurale Waffen bleiben für importierte
Karten lesbar, erscheinen aber weiterhin nicht in der Platzierungsauswahl.

**Spielen** übernimmt den Editorentwurf. Die drei Modelle erscheinen als
aufhebbare Waffen und anschließend in der Hand der Spielfigur. Wer unbewaffnet
ist, nimmt eine erreichbare Waffe automatisch auf; **E** wechselt zu einem
anderen Fund. **F** greift an. Das Schwert bleibt eine Nahkampfwaffe, der
Feuerstab verursacht Brandschaden und der Eisstab verlangsamt getroffene Ziele.
Seltenheit und Modellvariante bleiben beim Waffenwechsel erhalten. Die
Originalfarben der Modelle bleiben sichtbar; Fundring und HUD zeigen die
Seltenheit an.

Die Ausgangskarte enthält weiterhin vier Biome, zwei Brücken, das Wirtshaus
und die vier Mauer-/Zaunstrecken. Es werden keine Waffen automatisch platziert.

## Aufbereitung und Prüfung

Die Originale bleiben bytegenau erhalten. `scripts/prepare-tripo-weapons.py`
bereitet mit lokalem Blender browsergeeignete Ableitungen vor: reduzierte
Geometrie, eingebettete Originaltexturen mit höchstens 1024 Pixeln, metrische
Größe und ein Griffursprung für die Handbefestigung. Es wird kein neuer
Tripo-Auftrag gestartet. Quellen, Hashes, Größen, Methoden und tatsächliche
Vorher-/Nachher-Renderings stehen im Paket
[`assets/imported/tripo-weapons/`](../assets/imported/tripo-weapons/).

Das Schwert besitzt 11.999 Dreiecke, beide Stäbe jeweils 12.000. Die drei
GLBs benötigen zusammen 4.025.760 Bytes. Farb- und Materialtexturen haben
1024 Pixel, die verlustfreien Normal-Maps 768 Pixel. Vergleichsbilder zeigen
die erhaltenen Formen, Griffdetails und Kristallfarben. Das Schwert misst
1,25 Meter, beide Stäbe 1,70 Meter; +Y zeigt zur Spitze und der Ursprung
liegt im Griff.

Das Paket ist ein lokaler Projektimport nach dem vorhandenen Repositoryablauf.
Das zusätzliche `game-dev`-CLI ist in dieser Umgebung nicht installiert;
es wird keine damit durchgeführte Prüfung behauptet.

`npm run verify:assets` prüft die unveränderten Quellen, das vollständige
Paketverzeichnis, eingebettete GLB-Abhängigkeiten und die Browserbudgets.
Node-Tests prüfen Katalog, Karten-Roundtrip, Bereinigung, Aufnahme,
Waffenwechsel und Ressourcenbesitz. Die Browserabläufe
`tests/tripo_palette_smoke.py` und `tests/tripo_weapon_editor_smoke.py`
prüfen die eigenständige Ausgabe einschließlich Editor-zu-Spiel-Übergabe.
Sie verwenden Testkarten und verändern die Projektkarte nicht.

Geprüfter Stand: **311 Node-Tests**, Assetprüfung, Kartenprüfung und Build
bestanden; je **acht Editor- und Spiel-Browserprüfungen** ohne JavaScript-,
Shader- oder Ressourcenfehler. Der Spieltest prüft auch echte Treffer,
nachwirkenden Brandschaden und Verlangsamung nach dem Aufnehmen der neuen
Modelle. Prüfsummen und Einzelbefunde: [`tripo-weapons-check.json`](tripo-weapons-check.json).
Tatsächliche Aufnahmen: [Editor](tripo-weapons-editor.png) und
[Lavastab am Spieleravatar](tripo-weapons-game.png).

Die älteren Gras-/Avatar-Browserprüfungen erhalten ihre benötigten Grasflächen,
Testbiome und den Bogen jetzt über ausdrückliche Testkarten. Dadurch verlangen
sie keine früher entfernten Platzierungen oder Biome von der Ausgangskarte.

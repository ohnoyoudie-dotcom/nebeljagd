# Neue Assets für Nebeljagd

Neue Tripo-Exporte werden einheitlich hier gesammelt: **ein Unterordner pro
Modell**. Die ersten Ablagen sind bereits vorbereitet:

```text
assets/inbox/
  truhe/nebeljagd_truhe_v1.glb
  fass/nebeljagd_fass_v1.glb
  kiste/nebeljagd_kiste_v1.glb
```

Die Dateinamen sind Beispiele für die künftigen Exporte, keine bereits
vorhandenen Modelle. Weitere Gegenstände bekommen entsprechend eigene Ordner.
Bei einer neuen Fassung die Versionsnummer erhöhen und das Original behalten.

Kopiere neue Modelle, Texturen und Animationen in diesen Ordner und sage Codex,
welche Datei für welchen Zweck gedacht ist. Dateien müssen in die Projektkopie
übertragen werden, auf die Codex Zugriff hat; ein Ordner nur auf deinem eigenen
PC wird nicht automatisch synchronisiert. Alternativ kannst du sie im Chat
hochladen. Bei Übertragung mit Git den Branch **work** aktualisieren, Dateien
dort committen und pushen. `main` bleibt für diese Arbeiten unverändert.

- `.glb`: bevorzugtes Format für fertige Browser-Modelle; Texturen möglichst einbetten.
- `.blend`: Blender-Arbeitsdatei zum Bearbeiten und Exportieren.
- `.png` / `.jpg` / `.webp`: Texturen oder Referenzbilder.
- Bei heruntergeladenen Assets bitte Herkunft und Lizenz als Textdatei dazulegen.

## Ablage nach der Vorbereitung

- `assets/inbox/<objekt>/`: unveränderte Eingangsdateien aus Tripo oder Uploads.
- `Blender/<Objekt>/`: bearbeitbare `.blend`-Dateien, beispielsweise
  `Blender/Truhe/`. Bereits dort abgelegte GLB-Dateien können ebenfalls geprüft
  werden; die einheitliche Eingangsablage für neue Exporte ist dieser Ordner.
- `assets/imported/<paket>/source/` und `runtime/`: von Codex vorbereitete
  Originalnachweise und geprüfte Spielmodelle nach dem vorhandenen Rei-Muster.
- `assets/concepts/<objekt>/`: Bildvorlagen, Prompts und Herkunftsnachweise.

Alle neuen Modelle richten sich nach dem aktuellen Avatar und den
[gemeinsamen Stilregeln](../../docs/art-style.md).

Das Ablegen importiert ein Modell noch nicht automatisch ins Spiel. Codex kann es
anschließend prüfen, passend skalieren, als Browserdatei exportieren und im
Objektkatalog des Editors eintragen. Der Karteneditor platziert aktuell die
bereits eingebauten Objektarten; er ist kein beliebiger 3D-Dateiimporter.

Vorhandene originale Rei-Dateien: `assets/imported/rei/source/`.
Daraus erzeugte Browser-Dateien: `assets/imported/rei/runtime/`.
Die aktive Spielfigur: `assets/characters/nebeljagd_player_base_v1.glb`.
Die früheren Ranger- und Adventurer-Dateien bleiben als Vorgänger erhalten.

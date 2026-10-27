# Nebeljagd – Umwelt-Kit v1

## Inhalt

12 **eigenständig erzeugte, modulare 3D-Assets** als GLB-Dateien unter `assets/`:

| Kategorie | Dateien |
|---|---|
| Stein | `wall_stone_3m.glb`, `ruin_arch.glb`, `rock_cluster.glb`, `rock_single.glb` |
| Holz | `fence_wood_3m.glb`, `crate_wood.glb`, `house_timbersmall.glb` |
| Bäume | `pine_high.glb`, `pine_young.glb`, `oak_green.glb`, `oak_autumn.glb` |
| Vegetation | `grass_tall_patch.glb` |

Dazu: `nebeljagd_walddorf_demo.glb` mit einer Beispielanordnung, `asset_uebersicht.png`, `walddorf_vorschau.png`, `manifest.json` mit Dateiprüfsummen und Dreieckszahlen, `Kollisionen_und_Interaktionen.json` mit Anhaltswerten für Three.js.

## In Blender öffnen – einfachster Weg

1. ZIP entpacken.
2. Blender öffnen, neue Szene. Den Standardwürfel ggf. löschen (`A`, dann `X`).
3. **Datei → Importieren → glTF 2.0 (.glb/.gltf)**.
4. `nebeljagd_walddorf_demo.glb` wählen.
5. Taste **Home** drücken, um alle Teile zu sehen.
6. Oben rechts auf **Materialvorschau** wechseln.

Die Dateien sind im glTF-üblichen Y-up exportiert; Blender stellt sie beim Import aufrecht dar.

Alternativ in Blender im Bereich **Scripting** die Datei `IN_BLENDER_LADEN.py` ausführen. Dafür das Blender-Projekt zunächst im entpackten Ordner speichern, damit der Skriptpfad stimmt. Das Skript **löscht die bisher geöffnete Szene**, importiert die Demo, legt Kamera und Licht an und speichert `nebeljagd_walddorf_demo.blend`. Bestehende eigene Projekte vorher sichern.

## Einzelne Modelle bearbeiten

Alle `assets/*.glb` sind einzeln importierbare Meshes mit Materialgruppen und echten dreidimensionalen Oberflächen. Das sind **keine Bilder auf 2D-Ebenen**. Einfach ein Modell auswählen, importieren und in Blender verändern; um die Größe nach dem Import zu prüfen, `N` drücken und im Seitenpanel auf Abmessungen achten.

## Für Codex / Three.js

- Lade das jeweilige GLB mit `GLTFLoader`.
- In Three.js steht die Y-Achse senkrecht; GLB-Dateien verwenden glTF-Y-up.
- Erzeuge Kollisionen getrennt von der sichtbaren Mesh-Geometrie; `Kollisionen_und_Interaktionen.json` gibt erste Richtwerte.
- Wiederholte Vegetation später mit Instancing oder zusammengefasstem Rendering darstellen.
- Für hohe Gräser Triggerzonen nutzen: Figur etwa 45 % transparent, Gras selbst bleibt sichtbar.
- Die Beispielszene ist **nur eine Demo und kein optimierter Echtzeit-Spiellevel**. In einem Spiel aus einzelnen Bauteilen instanziieren und gezielt reduzieren.

## Qualität und Grenzen

Dies ist das **erste stilisierte Basis-Kit**, nicht schon die fertige Grafikqualität deiner Battlerite-Royale-Referenzen. Es fehlen noch gemalte Holz-/Steintexturen, hochwertige Pflanzenkarten, Dachziegel-Details, Geländeübergänge, Licht-Baking und sorgfältig von Hand nachbearbeitete Modelle. Die gezeigten PNGs sind eine einfache Softwarevorschau ohne echte Blender-Beleuchtung.

Die GLB-Geometrie und Materialinformationen wurden programmatisch erstellt und wieder eingelesen. Blender selbst war in der Erstellungsumgebung nicht installiert; ein echter Blender-Importtest steht daher noch aus.

**Nutzung:** Die neu erzeugten Modelle können für Nebeljagd verwendet und bearbeitet werden. Die Screenshots fremder Spiele sind keine Bestandteile dieses Pakets.

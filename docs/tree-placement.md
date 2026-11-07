# Dein eigener Baum 1 – GLB-Einbindung in Nebeljagd

Die fünf ursprünglichen GLB-Exporte enthielten nur eine Fläche und keinen Baum. Der neue FBX-Export **Tree1.fbx** enthält 8.140 echte Vertices und 4.598 Polygone mit Stamm, Zweigen und Blättern. Daraus wurde ein korrektes Y-up-GLB (8.704 Dreiecke, 3 Materialien, rund 200 KB) erzeugt, ohne die große Bodenfläche und ohne das ungewöhnliche Blender-Objekt-Offset.

Die FBX-Datei enthält die drei Materialnamen `tree_stylizedBark01`, `opaqueShadows`, `leaves04`, aber **keine eingebetteten Texturen** und bei allen drei Materialien nur dieselbe diffuse Grundfarbe. Die GLB-Datei verwendet deshalb vorläufig braune und grüne PBR-Farben. Für eine originalgetreue Texturierung sind die Blender-Texturbilder noch nötig.

## Einmalige Installation über GitHub Desktop

Kopiere **Tree1_converted.glb** in das vorhandene Projektverzeichnis und benenne die Kopie um in

```text
assets/imported/user-trees/runtime/tree1.glb
```

Die Datei muss **exakt** den SHA-256-Hash `d5f1b1d5ef222b85544d6be5ad320fd4acf2fd2ee979295c6034fce4cc887561` haben.

Danach die Datei mit **GitHub Desktop auf den Branch `work` committen und pushen**. Erst dann kann der automatische Build sie in den Online-Editor `https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html` einbetten. Keine manuelle Änderung der `worldmap.json` erforderlich.

Der GLB-Loader erkennt `tree1.glb` anhand seines Pfads beim nächsten Vite-Build: Bei vorhandener Datei erscheinen **Objekte → Einzeln → Baum → Dein Baum 1** und **Objekte → Verteilen → Baum**. Wenn die Datei fehlt, bleiben diese Optionen aus, statt ein leeres Modell zu zeigen.

Die alten vier GLB-Bäume bleiben für bereits gespeicherte Karten lesbar, sind aber für neue Platzierungen nicht mehr auswählbar. Der neue Baum wird in Weltkoordinaten von 0 bis 7,8 m Höhe gerendert und erhält einen Stamm-Kollisionsradius von 0,45 m. Randomisierte Drehung und JSON-Speicherung nutzen die vorhandene Editorlogik.

## Technische Prüfung

Die Unit-Tests validieren nach Installation Datei-Hash, GLB-Version, 8.140 Vertices, 8.704 Dreiecke, drei Materialien und die vorhandene Krone. Die Editor-Browserprüfung erwartet die neue Baum-Auswahl nur, wenn `tree1.glb` auf GitHub installiert ist. Der Rest der Karte wird nicht überschrieben.

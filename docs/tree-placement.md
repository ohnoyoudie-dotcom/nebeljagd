# Nebeljagd: Dein Baum 1 – transparente Blätter repariert

Die FBX-Exporte `Tree1.fbx` und `Tree1(1).fbx` sind identisch. Beide enthalten echte Baumgeometrie, aber **die Blatt-UVs und Texturtransparenz wurden beim FBX-Export nicht mitgeliefert**. Das erklärt die grünen Dreiecke im Spiel.

Die Blender-Sicherung `Tree1.blend1` enthält die originalen, gepackten Blattmasken. Daraus wurde die Maske `leavesTexture04.png` wiederhergestellt und den 1.194 Blattflächen mit neuen UV-Koordinaten zugeordnet. Überlappende, versehentlich doppelt exportierte Ast-Geometrie wurde entfernt.

Die neue Datei `assets/imported/user-trees/runtime/tree1.glb` hat 3 Materialien, 1 eingebettete Blatttextur, `alphaMode: MASK`, `doubleSided: true`, 7.256 Mesh-Eckpunkte und 6.992 Dreiecke. Sie ist von außen nicht abhängig und bleibt in den Offline-HTMLs verfügbar. SHA-256: `c8c125554459d89352f23a1d9377899b145617fd589abe36cdbf7d228820c92c` (223.816 Bytes).

Der Prüf- und Buildprozess lädt die korrigierte Datei nur dann aus dem verifizierten Medien-Upload, wenn `tree1.glb` noch fehlt oder noch die alte Version enthält. Er prüft den SHA-256-Wert, bevor der Build gestartet wird. Die fertige Datei wird danach nach `work` eingecheckt und zusammen mit dem aktuellen Editor über `main/preview` veröffentlicht.

Im Editor: **Objekte → Einzeln → Baum → Dein Baum 1** oder **Objekte → Verteilen → Baum**. Bereits gesetzte Objekte behalten ihre Position, Rotation und Skalierung. Die vier älteren Kit-Bäume bleiben aus der neuen Platzierungsauswahl entfernt; bereits gespeicherte alte Baumobjekte bleiben lesbar. `worldmap.json` wird nicht überschrieben.

Die tatsächliche Darstellung wurde zunächst lokal mit einem glTF/GLB-Renderer als Bild überprüft. Zur vollständigen Freigabe müssen auch die GitHub-Browserprüfungen und die GitHub-Pages-Bereitstellung erfolgreich sein.

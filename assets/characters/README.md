# Neutraler Nebeljagd-Abenteurer

`adventurer.glb` ist der im Spiel verwendete, klassenneutrale menschliche Basisavatar.
`adventurer.blend` enthält das bearbeitbare Modell, das humanoide Skelett, die
Animationen und die Prüfkamera. Das Modell blickt in glTF nach +Z; Y ist oben.
Die Maße sind Meter. Der bestehende Spielfaktor von 1,2 bleibt für die
Einordnung in Welt, Waffen und Versteckgras erhalten.
Der exportierte Stand hat 24.964 Dreiecke, 22 Gelenke und 1,8456 Meter Höhe.

Die getrennten Modellteile umfassen Kopf/Hals, Hände, Haare, Jacke, Unterhemd,
Hose, Stiefel sowie Gürtel/Tasche. Haut, Haar, Stoff, Leder und Metall verwenden
fünf glTF-kompatible PBR-Materialien mit modellierter Form und Vertexfarben.
Es werden keine externen Texturen geladen. Der zusammenhängende Körper als
Bearbeitungsvorlage bleibt zusätzlich in der Blender-Quelle; verdeckte
Körperflächen werden nicht zusätzlich unter der Kleidung im Spiel gerendert.

Die GLB enthält drei eigene Skelettanimationen:

- `Idle_Nebeljagd`: ruhige Atmung und Gewichtsverlagerung, Schleife.
- `Run_Nebeljagd`: Laufbewegung am Ort, Schleife; die Spiellogik übernimmt den Weg.
- `Roll_Nebeljagd`: Abtauchen, Einrollen, vollständiger Vorwärtspurzelbaum und
  Aufstehen. Die enthaltene Rotation erfolgt um die lokale X-Achse. Das Spiel
  stimmt die Abspieldauer auf die 0,72 Sekunden der bestehenden Rollmechanik ab.

Waffen gehören weiterhin zur Ausrüstung. Die Armbewegungen für Bogen, Schwert
und Zauberstäbe werden beim Benutzen auf das animierte Skelett gelegt.
Die Rolle verwendet den enthaltenen Clip; das Modell bekommt keine zweite
Drehung oder Größenverzerrung im Spielcode.

## Bearbeiten und prüfen

```sh
blender --background --python scripts/build-avatar.py
# Zusätzlich Studio-, Nah-, Spielkamera- und Rollphasenbilder rendern:
blender --background --python scripts/build-avatar.py -- --render
npm test
npm run verify:assets
npm run build
```

Der Generator erstellt `adventurer.blend` und `adventurer.glb` neu. Manuelle
Blender-Änderungen deshalb unter einem eigenen Dateinamen sichern, bevor der
Generator erneut ausgeführt wird. Die gespeicherte Blender-Datei kann direkt
für weitere Modellarbeit geöffnet werden.

`avatar-preview.html` bietet im Entwicklungsserver die Ansicht von vorn/hinten,
das Gesicht, den Winkel der echten Spielkamera und die drei Clips mit
Zeitleiste und Zeitlupe. Nach dem Build liegt die vollständige, eingebettete
Version unter `dist/avatar-preview.html` und im Welt/Editor-ZIP.

Messwerte und Asset-Hash stehen in `adventurer-inspection.json`. Die Tests lesen
die tatsächliche GLB mit dem Three.js-Importer, prüfen Gewichte, Abmessungen,
Schleifen, die Vorwärtsrotation und die verformte Geometrie. Browserbefunde
stehen in `docs/avatar-check-gameplay.json`, wenn der Browser-Test ausgeführt wurde.
Diese Prüfungen ersetzen keinen Test auf einem echten Schul-iPad.

## Herkunft

Originales, lokal mit Blender-Python erstelltes Projektmodell. Keine fremden
Meshes, Texturen, Motion-Capture-Daten oder kostenpflichtigen Generierungsdienste
wurden verwendet. Nutzungsrechte folgen den Regelungen dieses Projekts; eine
zusätzliche Fremdasset-Lizenz wird nicht eingeführt. Der Arbeitsauftrag ist in
`docs/avatar-brief.md` festgehalten. Das optionale `game-dev`-CLI war in dieser
Umgebung nicht installiert; die dokumentierten Prüfungen verwenden Blender,
Three.js und Chromium direkt und sind keine CLI-Paketzertifizierung.

Der vorherige Prototyp bleibt als `ranger.blend`, `ranger.glb`,
`ranger-preview.png`, `inspection.json` und `scripts/build-character.py` erhalten.
Er wird vom aktuellen Spiel nicht mehr geladen.

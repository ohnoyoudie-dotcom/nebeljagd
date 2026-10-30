# Hausdateien: untexturierter Export und weiterer Export mit Texturen

Inzwischen wurden **beide** hochgeladenen Hausdateien geprüft. Die Datei
`medieval house interior 3d model.glb` enthält keine Texturen. Die zusätzliche
`medieval house interior 3d model (1).glb` enthält drei eingebettete Texturbilder
mit jeweils 4096 × 4096 Pixeln: Farbtextur, Metall-/Rauheitskarte und Normalkarte.
Ihre Farbtextur ist dem Material zugeordnet, `TEXCOORD_0` ist vorhanden, und
das Farbbild wurde im Browser erfolgreich dekodiert. Es zeigt tatsächlich
Farbdetails und ist nicht nur ein weißes Bild.

Die beiden Dateien haben unterschiedliche Geometrie (1.826.864 gegenüber
1.869.854 Dreiecken). Sie werden deshalb als zwei separate Versionen behandelt;
es ist nicht belegt, dass die zweite nur eine neu exportierte Texturvariante
der ersten ist. Es wurde kein Haus im Spiel ausgetauscht.

Browserbericht der zusätzlichen Datei: `house-texture-browser-report-1.json`.

## Ursprüngliche Datei ohne „(1)“

Geprüft wurde `assets/inbox/medieval house interior 3d model.glb` aus dem
vom Nutzer hochgeladenen Stand auf Branch `work`. Das Original wurde nicht verändert.

| Merkmal | Neues Haus | Funktionierende Taverne (Original) |
| --- | --- | --- |
| Dateigröße | 43.841.988 Bytes | 65.440.900 Bytes |
| Texturbilder | 0 | 3 |
| Texturzuordnungen | 0 | 3 |
| Material | Nur der Name `material`, keine Farbbildzuordnung | PBR-Material mit Farbtextur |
| UV-Koordinaten | Keine | `TEXCOORD_0` vorhanden |
| Vertexfarben | Keine | Für die Farbtextur nicht erforderlich |

Das Haus enthält Positionen, Normalen und Indizes für 1.826.864 Dreiecke.
Es enthält keine verknüpften Farbtexturbilder und keine alternative
Vertexfärbung. Das Material fällt dadurch auf die Standardfarbe Weiß zurück.
Eine reine Umschaltung der Darstellung kann die fehlenden Holz-, Stein- oder
Stofftexturen aus **diesem GLB** nicht wiederherstellen.

Die Dateiprüfung sagt nicht, ob die Texturen bei der Tripo-Erzeugung fehlten,
der Texturierungsschritt noch nicht ausgeführt wurde oder ein Export ohne
Texturen gewählt wurde. Diese Zustände sind aus dem exportierten GLB allein
nicht unterscheidbar.

## Nächster Schritt für die untexturierte Datei

In Tripo das vorhandene Haus öffnen und dessen Texturierung prüfen bzw.
ausführen, dabei die farbige Hausvorlage als Referenz verwenden, sofern die
Oberfläche dies anbietet. Danach einen GLB-Export mit eingebetteten Texturen
erstellen. Vor dem Spieleinbau muss geprüft werden, dass Bilder,
Farbtexturverweise und UV-Koordinaten tatsächlich im Ergebnis enthalten sind.
Die Datei mit „(1)“ hat diese Struktur- und Bildprüfung bereits bestanden;
eine Prüfung ihrer Raumgeometrie, Kollisionen und Darstellung im Spiel steht aus.
Es wurde kein kostenpflichtiger Tripo-Auftrag gestartet und keine Ersatzfärbung
in die Originaldatei geschrieben.

Die funktionierende Taverne dient als Vergleich: Ihre Farbtextur wurde im
Browser als 4096×4096-Bild geöffnet. Der lokale
`tools/glb-texturcheck.html` bestätigt beim Haus die fehlenden Texturzuordnungen;
es gab keine Browserfehler und keine externen Netzwerkanfragen.

Prüfsummen und Strukturvergleich: `house-texture-diagnosis.json`.
Browserbericht des tatsächlichen Hauses: `house-texture-browser-report.json`.

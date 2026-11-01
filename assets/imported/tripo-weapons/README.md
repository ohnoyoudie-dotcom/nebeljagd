# Neue Waffen für Nebeljagd

Originale: `assets/inbox/`; unverändert erhalten. Abgeleitete Browsermodelle
stehen in `runtime/`. Alle Modelle verwenden Meter, +Y entlang des Griffs,
und den Ursprung in der Mitte des sichtbaren Ledergriffs. Die gekrümmten
Schäfte bleiben erhalten. Die echten Spitzensockets stehen in `inspection.json`
und `src/map/tripo-weapon-definitions.js`.

Die Originale haben jeweils etwa 1,9 Millionen Dreiecke. Browserfassungen
verwenden 12.000 / 14.000 Dreiecke und behalten originale UVs/PBR-Texturen,
auf maximal 1024² verkleinert. Keine neuen Modelle oder Texturen erzeugt.
Die grünen Punkte in den Blender-Vorschauen markieren nur den Griffursprung;
sie werden nicht ins Laufzeitmodell exportiert.

Reproduktion: `blender -b -t 3 --python scripts/prepare-tripo-weapons.py`.
Einzelmodell: `-- --only sword`, `ice-staff` oder `fire-staff` anhängen.
`inspections/`, `provenance.json` und `runtime-manifest.json` enthalten Messungen,
Hashes, Verarbeitung und Herkunft. Vom Nutzer bereitgestellte Projektmodelle;
kein Anbieteraufruf und kein separater kommerzieller Lizenzbeleg geliefert.
Dies ist das vorhandene Blender-Paketformat des Projekts; die game-dev-CLI
ist hier nicht installiert. WebGL, Editor und Halteanimationen separat prüfen.

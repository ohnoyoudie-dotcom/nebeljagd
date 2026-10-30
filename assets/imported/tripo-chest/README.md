# Tripo-Truhe

Original: `assets/inbox/treasure chest 3d model.glb` (unverändert).
Browser-Modell: `runtime/chest.glb`, 1,72 m breit. Der separate Knoten
`chest-lid` dreht um das rückseitige Scharnier; die Öffnungsanimation und
Gold-/Waffenbeute werden vom vorhandenen Truhensystem gesteuert.

Die geschlossene Originalhülle wurde am sichtbaren Deckelspalt geteilt.
Innenwände, Innenboden und Deckelunterseite aus dunklem Holz ergänzen die
beim Öffnen neu sichtbaren Flächen. Die originalen PBR-Texturen bleiben erhalten.

Reproduktion: `blender -b -t 3 --python scripts/prepare-tripo-chest.py`.
`inspection.json` enthält Maße und echte GLB-Zählwerte; `provenance.json`
zeichnet Herkunft und Verarbeitung auf. `runtime-manifest.json` sichert alle
Paketdateien mit SHA-256. Die Blender-Vorschauen zeigen geschlossen/offen.
Browserverhalten und GPU-Import werden separat bei der Integration geprüft.

Vom Nutzer bereitgestelltes Tripo-Modell. Kein kostenpflichtiger Dienst wurde
aufgerufen; ein separater kommerzieller Lizenzbeleg liegt diesem Paket nicht bei.

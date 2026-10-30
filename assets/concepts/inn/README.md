# Großes Wirtshaus: Bildvorlage für Tripo

`inn-reference.png` ist die aktuelle Vorlage: ein großzügiges dachloses
Fachwerk-Wirtshaus mit Steinfundament, hohem Wandabschluss, offenem Gastraum,
Theke, zwei Tischgruppen, abgetrennter Küche und freiem Nebenbereich mit Bank.
Vorderer und hinterer Eingang sowie der Zugang zur Küche bleiben offen.
Der Nebenbereich ist in dieser Bildfassung offen mit dem Gastraum verbunden;
die im Prompt gewünschte zusätzliche Trennwand wurde nicht zuverlässig erzeugt.
Das Bild dient als Form- und Stilreferenz, nicht als maßhaltiger Bauplan.

Die Vorlage verwendet den aktuellen Avatar sowie Brunnen und Karren als
Materialreferenzen. Es gelten die [gemeinsamen Stilregeln](../../../docs/art-style.md).
`inn-reference-v1.png` bewahrt den ersten Entwurf; für Tripo die aktuelle
Datei ohne `-v1` verwenden. In ihr ist der störende niedrige Bodenbalken
vor dem rechten Nebenbereich entfernt.

## Tripo

Nur `inn-reference.png` als Bildvorlage verwenden. Als ergänzende Beschreibung:

> Large roofless single-storey fantasy timber inn with open interior, tall
> thick walls, cream plaster, walnut beams and stone foundation. Preserve the
> open front and rear entrances and the wide kitchen doorway. Continuous solid
> floors, empty walking routes, sparse furniture. No roof, ceiling, closed
> doors, extra storey, terrain or display plinth. Match the image materials.

Das Ergebnis von allen Seiten und innen ansehen. Besonders auf zugemauerte
Türen, unvollständige Böden, verschmolzene Möbel und versehentlich erzeugte
Dächer achten. Ein einzelnes Bild garantiert keine korrekten Innenräume.
Das ursprüngliche Ergebnis als GLB mit eingebetteten Texturen speichern:

`assets/inbox/wirtshaus/nebeljagd_wirtshaus_v1.glb`

## Spätere Aufbereitung

- Ausgangsmaß als Ziel: etwa 22 × 18 m, Außenwände ca. 4,2 m,
  offene Durchgänge mindestens 2,8–3,2 m; erst am GLB neben dem Avatar prüfen.
- Türen, ebene Böden, Wanddicke und erreichbare Räume in Blender prüfen und
  bei Bedarf gezielt nachmodellieren. Möbel möglichst separat halten.
- Original unverändert aufbewahren; Blender-Arbeitsdatei später unter
  `Blender/Wirtshaus/` speichern.
- Kollisionen für Wände und große Möbel explizit passend zur Geometrie anlegen.
  Freie Durchgänge dürfen nicht durch vereinfachte Haus-Boxen blockiert werden.
- Feuer als separaten Spieleffekt behandeln; im Bild sichtbare Flammen nicht
  als starre Dekorationsgeometrie übernehmen.
- Dach bleibt für die Spielkamera entfernt. Ansicht, Sichtblocker und
  Begehbarkeit bei mehreren Gebäude-Drehungen im Spiel prüfen.

Noch kein GLB, kein kollisionsgeprüftes Haus und kein neuer Editor-Eintrag.
`provenance.json` hält Bildherkunft, Prompts und SHA-256-Prüfsummen fest.

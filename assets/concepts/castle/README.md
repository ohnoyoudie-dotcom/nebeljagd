# Großes Schloss: Bildvorlage für Tripo

`castle-reference.png` ist die aktuelle Bildvorlage für ein großes dachloses
Schloss im Stil des aktuellen Nebeljagd-Avatars. Der Entwurf zeigt einen
zentralen Ballsaal mit Thronnische, Eingang, Bibliothek und Wachraum links
sowie Speisesaal und Küche rechts. Heller Naturstein, dunkles Holz,
gedämpftes Rot und sparsame Messing-/Goldakzente bestimmen die Gestaltung.
Große freie Bodenflächen und Einrichtung entlang der Wände erhalten die
Lesbarkeit aus der Spielkamera.

Es gelten die [gemeinsamen Stilregeln](../../../docs/art-style.md).
Die Vorfassung bleibt als `castle-reference-v1.png` erhalten; für Tripo die
aktuelle Datei ohne `-v1` verwenden. Der zweite Durchlauf ergänzt die
östliche Ausgangssituation und präzisiert die Durchgänge.

## Vorgaben für das spätere 3D-Modell

- Grundfläche ungefähr **70 × 55 m**, als großer Schauplatz der Insel.
- Zentraler Ballsaal ungefähr **28 × 22 m**.
- Eine begehbare Etage; Dach und Decken vollständig entfernt.
- Außenwände ungefähr 5,5 m, innere Trennwände ungefähr 4,5 m hoch.
  Maßstab und Sichtbarkeit neben der Spielfigur prüfen.
- Drei Ausgänge: Hauptportal im Süden, Westtor und Ausgang nahe der Küche
  im Osten. Türöffnungen mindestens 3 m breit; Hauptportal großzügiger.
- Etwa 4 m breite Verbindungen und ein Rundweg um den Ballsaal sind das
  Planungsziel. Alle Seitenräume sollen erreichbar sein, mit alternativen
  Wegen zwischen den Flügeln.
- Große Möbel separat; freie Wege, ebene Böden und keine geschlossenen
  Türen oder Schwellenbalken in den vorgesehenen Durchgängen.

Diese Maße sind Zielvorgaben, keine aus dem Bild bestätigten Abmessungen.
Die Bildfassung zeigt **keinen eindeutig vollständigen Ringkorridor hinter
der Thronnische**. Der östliche Ausgang ist durch die Perspektive teilweise
verdeckt. Die tatsächliche Tiefe einzelner Innenbögen sowie die kleinen
Stufen an der Thronnische müssen beim Modellieren geprüft und gegebenenfalls
zu echten Durchgängen bzw. einer flachen Rampe geändert werden.

## Tripo und Blender

Die aktuelle Bilddatei einzeln als Vorlage verwenden. Ergänzende Beschreibung:

> Large roofless single-storey fantasy stone palace, open interior and tall
> solid walls. Huge central ballroom, west library and guardroom, east dining
> room and kitchen. Preserve open south, west and east exit portals and wide
> interior doorways. Continuous solid floors and clear circulation. Pale
> limestone, walnut, muted crimson and restrained aged brass. No roofs,
> ceilings, additional floors, closed doors or scenery. Match the image.

Ein Tripo-Gesamtmodell zunächst als Entwurf behandeln. Bei dieser Größe
Gebäudehülle, Raumteile und Möbel möglichst getrennt aufbereiten. Eine
automatische Erzeugung aus einem Bild garantiert keine korrekten Innenräume.
Noch keine einzelnen Raumvorlagen oder fertigen GLBs vorhanden.

Den unveränderten Export mit eingebetteten Texturen ablegen unter:

`assets/inbox/schloss/nebeljagd_schloss_v1.glb`

Spätere Blender-Arbeitsdateien gehören nach `Blender/Schloss/`. Originale
unverändert behalten. Fackel- und Kaminflammen später separat als Spieleffekt
umsetzen, statt sie als starre Teile der Architektur zu übernehmen.

Vor dem Einbau: Maßstab neben dem Avatar, vollständige Böden, Wanddicken,
Durchgänge, Möbelkollisionen und Sichtblocker prüfen. Die bestehende
Hausintegration hat teilweise feste Prüfentfernungen für kleine Gebäude;
für das Schloss müssen diese an die tatsächlichen Gebäudegrenzen angepasst
werden. Begehbarkeit bei verschiedenen Drehungen und Leistung im Browser
prüfen, bevor das Schloss als Kartenobjekt registriert wird.

## Status

Dies ist eine geprüfte PNG-Bildvorlage, **kein erzeugtes GLB und kein bereits
begehbares Spielgebäude**. Kein Tripo-Auftrag wurde hier gestartet.
Prompts, Originalpfade und SHA-256-Prüfsummen stehen in `provenance.json`.

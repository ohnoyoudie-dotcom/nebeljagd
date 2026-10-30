# Großes Gartenschloss – eingerichtete Bildvorlage

**castle-reference.png** ist die neue Bildvorlage für das große, zusammenhängende
Nebeljagd-Schloss. Sie zeigt eine geschlossene Gebäudehülle mit vier Außenportalen,
offenem Dach, eingerichteten Raumgruppen und einem grünen Gartenhof. Die PNG-Datei
hat **1448 × 1086 Pixel** und wurde unverändert aus der Bildgenerierung übernommen.

## Entwurf und Einrichtung

Die strukturelle Vorlage ist
[Grundrissentwurf 02](../castle-grand-plan/floorplan.svg), geplant mit 30 Räumen,
maximal 270 × 220 m Ausdehnung, mindestens 24 m kurzer Raumseite und vier Zugängen.
Das Gebäude besitzt eine begehbare Etage. Die fehlenden Dächer und Decken machen
die Innenräume für die Spielkamera sichtbar; die Außenfassaden bleiben erhalten.

Die Bildfassung enthält unter anderem Bibliotheksregale und Lesetische,
Ratstisch, Thronbereich, Kapelle, Banketttische, Musikzimmer, Galerie,
Küchenherde und Arbeitsflächen, Schränke, Gästebetten, Teppiche und Wandgestaltung.
Große zusammengehörige Möbelgruppen lassen die Räume bewohnt wirken.
Gänge und zentrale Bewegungsflächen bleiben im Konzept frei.
Kisten, Fässer und Beutetruhen werden später separat platziert.

Stilreferenz ist das tatsächliche Avatarportrait; die ältere kleine Schlossvorlage
diente ausschließlich als Material- und Architekturbeispiel. Es gelten die
[gemeinsamen Stilregeln](../../../docs/art-style.md).

## Verwendung in Tripo

**Nur castle-reference.png als Objektbild hochladen**, nicht das Avatarportrait
oder den beschrifteten Grundriss als weitere Objektansicht. Eine ergänzende
Beschreibung liegt in **tripo-description.txt**. Eine vollständige Gebäudehülle
mit getrennten Innenflächen, Durchgängen und Einrichtung ist das Ziel.

Die Bildfassung ist eine künstlerische Interpretation, keine maßverbindliche
Rekonstruktion sämtlicher Räume und Türen. Kapelle und Sakristei erscheinen
zusammengefasst; im Südflügel gibt es zusätzliche schmale Unterteilungen.
Einige Proportionen und Türpositionen weichen vom Grundriss ab.
Für exakte Raumaufteilung, Durchgänge und Größen bleiben **floorplan.json /
floorplan.svg** im Nachbarordner maßgeblich.

Ein automatisch aus einem Bild erzeugtes Modell muss anschließend auf offene
Türen, geschlossene Böden, Wanddicken, Möbelskala und Kollisionen geprüft werden.
Einrichtung, Wände und Gebäudeflügel bei Bedarf in Blender getrennt aufbereiten.

Den originalen GLB-Export mit eingebetteten Texturen beispielsweise hier ablegen:

**assets/inbox/schloss/nebeljagd_gartenschloss_v1.glb**

Blender-Arbeitsdateien später unter **Blender/Schloss/** speichern.
Die ursprüngliche Exportdatei unverändert behalten. Leuchteffekte aus dem
Referenzbild später als echte Spiellichter oder Effekte umsetzen.

## Status und Herkunft

Dies ist eine 2D-Bildvorlage, **kein fertiges GLB und kein eingebautes Gebäude**.
Es wurde kein Tripo-Auftrag gestartet. Das Original bleibt unter dem in
provenance.json dokumentierten Generierungspfad erhalten.
prompt.txt speichert den vollständigen Bildauftrag einschließlich Ausschlüssen,
provenance.json die Referenzen, Originalpfade und Prüfsummen.

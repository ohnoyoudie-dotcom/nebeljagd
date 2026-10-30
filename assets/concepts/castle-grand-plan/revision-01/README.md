# Großes Gartenschloss · Grundrissentwurf 01

Dies ist der schematische Entwurf vor der detaillierten Schloss-Bildvorlage.
Die maßgebliche Zeichnung ist **floorplan.svg**, die zugehörige Ansicht
**floorplan.png**. **floorplan.json** speichert Räume, Gänge, Türen und Zugänge
in Metern. Die Dateien sind eine neue Planungsbasis; die bisherige
Schlossvorlage und die Spielkarte werden nicht ersetzt.

## Größe und Aufbau

- Eine offene, begehbare Etage, später ohne Dach und Decken für die Spielkamera.
- Gebäude 180 × 150 m, 27.000 m², etwa siebenfache Grundfläche des früheren 70 × 55 m-Entwurfs.
- Genau 30 Räume; Garten und Gänge zählen nicht als Räume.
- Gartenhof 80 × 64 m, darin eine 72 × 56 m große Grünfläche mit kreuzenden Wegen.
- Umlaufender 8 m breiter Gang, ungefähr 320 m pro Runde.
- Vier 8 m breite Außenportale: Norden, Süden, Westen und Osten.
- Raumtüren meist 4 m, zwei große Ballsaalöffnungen 6 m breit.

Nordflügel: Bibliothek, Archiv, Schreibstube, Kartenraum, Ratssaal, Thronsaal,
Audienzsaal, Kapelle, Sakristei und Schatzkammer.
Westflügel: 42 × 28 m großer Ballsaal, Musiksalon, Empfangssalon und Galerie.
Ostflügel: Speisesaal, Küche, Vorräte, Backstube, Personalraum und Lager.
Südflügel: zwei Wachstuben, Waffenkammer, vier Gästezimmer, zwei Gästesalons
und Garderobe. Die südliche Vorhalle ist Teil der Verkehrsflächen.

Alle Räume haben mindestens zwei Verbindungen. Direktzugänge an den Galerien,
Verbindungstüren zwischen benachbarten Räumen und vier Gartenzugänge ermöglichen
alternative Wege. Prüfung und Maße stehen in validation.json; das ist eine
Grundrissprüfung, noch keine Prüfung echter Spielfiguren und Kollisionen.

## Weiterbearbeitung

Die SVG lässt sich in einem Vektorprogramm bearbeiten. SVG-Änderungen verändern
die JSON-Daten nicht automatisch. generate-plan.py erzeugt den ursprünglichen
Grundentwurf und seine SVG erneut; manuell geänderte Dateien dabei separat
halten. Die PNG-Ansicht wird aus der SVG gerendert.

schematic-concept.png ist eine zusätzliche mit ImageGen gestaltete Ansicht,
keine maßverbindliche Zeichnung. Für die Anzahl und Lage der Tür- und
Außenöffnungen sowie den Maßstab gelten immer SVG und JSON. Die Bildfassung
interpretiert einzelne äußere Galeriegrenzen und Maßlinien dekorativ.

Erst nach der Grundrissabstimmung folgt das detaillierte Fantasy-Referenzbild.
Für die tatsächliche 3D-Umsetzung empfehlen sich getrennte Flügel, Raumsegmente,
Mauern und Möbel. Die Größe und 30 Innenräume lassen sich so zuverlässiger
aufbauen und prüfen als mit einem einzigen automatisch erzeugten Komplettmodell.

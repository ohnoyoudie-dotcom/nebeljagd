# Großes Gartenschloss · Grundrissentwurf 02

Überarbeitete schematische Planungsbasis mit breiteren Räumen und asymmetrischer
Anlage. Maßgeblich sind **floorplan.svg** und **floorplan.json**; **floorplan.png**
ist die aus der SVG gerenderte Ansicht. Die Spielkarte wird dadurch nicht verändert.

## Änderungen gegenüber Entwurf 01

- Weiterhin 30 Räume und vier Außenportale, eine offene Etage für die spätere Spielkamera.
- Die kürzere Raumseite beträgt jetzt mindestens 24 m statt bisher teils 14 m.
  Ihr Durchschnitt steigt von 16,6 auf 30,7 m. Die Räume sind deutlich kompakter:
  das größte Seitenverhältnis sinkt von 2,03 auf 1,67.
- Unterschiedliche Raumgrößen, zusammenhängende Zimmergruppen und gestaffelte
  Außenwände ersetzen die langen Reihen gleich großer schmaler Räume.
- Der Nordflügel hat einen eigenen Bibliotheksgang und einen großen Thronsaal.
  Westlich liegt der Ballsaal; im Osten springt der Versorgungstrakt vor.
  Der Südflügel bekommt einen zusätzlichen Gästegang und eine breite Vorhalle.
- Gartenhof und Eingänge sind versetzt. Die Gartenwege verlaufen geschwungen;
  Pflanzgruppen und Brunnen sind ungleich verteilt.

## Maße und Wege

- Maximale Ausdehnung einschließlich Ostflügel: **270 × 220 m**.
  Das ist das umschließende Rechteck, nicht die tatsächliche Grundfläche.
- Die gestaffelte Anlage einschließlich Hof umfasst **50.872 m²**.
- Gartenhof: **88 × 72 m**. Die 80 × 64 m große innere Pflanzzone wird von Wegen
  durchquert; sie ist keine reine Netto-Rasenfläche.
- Ballsaal: **54 × 40 m**. Thronsaal: **48 × 58 m**.
- Gänge meist 8 m, Vorhalle und Haupteingang 12 m breit.
- Rundweg um den Garten: etwa 352 m auf der Gangmittellinie.
- 73 Türöffnungen zwischen Räumen, Gängen und Garten sowie vier Außenportale.
  Alle Räume haben mindestens zwei Verbindungen; von jedem Tor sind alle Räume erreichbar.

Die durchgeführten Geometrie- und Wegeprüfungen stehen in validation.json.
Das ist eine Grundrissprüfung, noch keine Prüfung von Spielfiguren,
Möblierung, Kollisionen oder Sichtlinien in der Engine.

## Bearbeiten und weiterverwenden

- **floorplan.svg:** editierbar in Inkscape, Illustrator oder einem anderen Vektorprogramm.
- **floorplan.json:** Raumrechtecke, Außenpolygon, Gänge, Türpositionen, Gartenwege
  und Maße in Metern. Schema-Version 2 ist Planungsdatenformat, kein Runtime-Import.
- **generate-plan.py:** erzeugt den zweiten Grundentwurf, die SVG und die Prüfzusammenfassung.
- **render-preview.py:** rendert die SVG mit Playwright und Chromium als PNG.

SVG und JSON synchronisieren sich nicht automatisch. Vor dem erneuten Generieren
manuell bearbeitete Dateien separat sichern.

Der erste Entwurf ist vollständig in **revision-01/** erhalten, einschließlich
der damaligen dekorativen ImageGen-Ansicht. Diese gehört ausschließlich zu Entwurf 01.
Entwurf 02 ist eine maßbasierte Vektorzeichnung ohne neue ImageGen- oder Tripo-Generierung.

Das detaillierte Fantasy-Referenzbild folgt nach der Grundrissabstimmung.
Für das spätere große 3D-Gebäude sind getrennte Flügel, Raumsegmente, Mauern
und Einrichtung vorgesehen.

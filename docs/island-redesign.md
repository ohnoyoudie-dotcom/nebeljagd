# Nebelinsel: Buchten und Halbinseln

Dieser Bericht beschreibt die erste Überarbeitung der Küste. Anschließend
wurde die Goldheide-Lagune mit zwei Landzugängen ergänzt und das Wegenetz samt
Flüssen und Brücken entfernt. Aktueller Stand: [Zwei Landzugänge](two-access-island.md).
Die folgenden Zahlen und Prüfungen dokumentieren den damaligen Stand.

Die Kartenbasis besitzt jetzt eine stärker gegliederte Küste: ein nördliches
Frostkap, eine tiefe Bucht zwischen den beiden Armen der Goldheide, kleinere
Ostbuchten, eine vorspringende Aschenhalbinsel und eine Moorbucht im Südwesten.
Alles bleibt eine zusammenhängende Insel mit breiten Landverbindungen.

Die sieben Regionen behalten Namen und Biome. Ihre gemeinsamen Grenzen haben
zusätzliche natürliche Biegungen; die angrenzenden Polygone verwenden dieselben
Kanten, damit keine Lücken oder Überlappungen entstehen. Wege erhalten leichte
Bögen und einen zusätzlichen Glutpfad. Beide Flüsse münden sichtbar ins Meer.
Der Sonnenweg verläuft deutlich westlich des Goldbachs. Sieben Brücken sichern
die tatsächlichen Flussquerungen, einschließlich der Wegränder.

Die Landfläche beträgt weiterhin rund **1,09 km²** bei 1.120 × 1.385 Metern
Ausdehnung. Die Küste verwendet 84 bewusst gesetzte Punkte; kleine zusätzliche
Zacken wurden vermieden, da jeder Punkt die Terrain-Triangulation vergrößert.
Die aktuelle Taverne, vier Mauer-/Zaunstrecken und sämtliche bestehenden
Landschaftsmalereien bleiben unverändert. Es wurden keine alten Modelle neu
verteilt. Zehn Startflächen bieten weiterhin insgesamt 50 Plätze und liegen
vollständig außerhalb von Meer und Flüssen.

`worldmap.json` ist die bearbeitbare Quelle; `worldmap.svg` wurde daraus neu
erzeugt. `docs/island-redesign.png` zeigt denselben finalen Stand. Vorhandene
separat gespeicherte Karten werden dadurch nicht überschrieben.

Prüfung: Kartenvalidierung ohne Warnungen; `tests/island_routes.test.js` prüft
Wege samt beider Ränder und 0,5 m Reserve in Zwei-Meter-Schritten, Erreichbarkeit
aller benannten Orte über ein zusammenhängendes Wegenetz sowie vollständig
trockene Startkreise. Die Runtime- und Triangulationsprüfung erfolgt zusätzlich
über `tests/island_runtime.test.js` beziehungsweise den Browserprüfbericht.
Diese Prüfungen bestätigen Geometrie und grundlegende Erreichbarkeit, noch
keine Mehrspieler-Balance oder Leistung auf einem physischen Mobilgerät.

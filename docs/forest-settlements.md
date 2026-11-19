# Waldbereich – bebaute Projektkarte

Die gespeicherte `worldmap.json` enthält eine zusammenhängende Waldwelt aus vorhandenen Editor-Modellen. Alle neuen Elemente sind normale, einzeln verschiebbare Objekte, Wege und Bodenflächen; es gibt keine Laufzeit-Zufallsplatzierung.

| Ort | Neue Häuser | Charakter |
| --- | ---: | --- |
| Lindenwacht | 18 | Kleine Marktstadt mit inneren Hofhäusern und mehreren Ausgängen |
| Farnhöhe | 8 | Dorf am nördlichen Waldsaum |
| Eichenruh | 5 | Westliches Wald- und Gartendorf |
| Moosbrunn | 5 | Dorf am Übergang zum Moor |
| Holzschlag | 3 | Kleiner Holzfällerweiler |
| Waldrain | 3 | Abgelegener Weiler am westlichen Rundweg |

Dazu kommen drei einzelne Waldhäuser, vier Brunnen, Gartenbäume, abgestellte Wagen, kurze Zaunabschnitte und Felsgruppen. Die Vegetation liegt in unterschiedlich dichten Baumgruppen mit Lichtungen und freien Wegsäumen. Die bestehenden Brücken werden angebunden; die anderen Biome erhalten keine neue Bebauung.

Der Ausbau ergänzt 45 Häuser und insgesamt 1.542 Objekte, 75 Wegabschnitte, 19 kurze Zaunstrecken sowie sechs Dorfplatz-Bodenflächen. Alle 50 bisherigen Objekte, 88 Bodenmalereien, Biomflächen, Küsten, Brücken, Start- und Spielregeln bleiben unverändert. Truhen, Waffen und Gegner werden nicht zusätzlich verteilt. Ortsnamen stehen in den Editor-Objektnamen; es entstehen keine neuen Ortsmarker oder Spawn-Zonen.

`scripts/populate-forest.js` dokumentiert den deterministischen Entwurf (Seed 19112026). `--write` schreibt nur auf eine noch nicht ausgebaute Karte. Ist der Ausbau bereits vorhanden, bricht das Skript ab und schützt damit spätere manuelle Bearbeitungen. Für Änderungen an der fertigen Karte den Editor verwenden. IDs beginnen mit `forest-world-`.

`tests/forest-settlements.test.js` prüft den unveränderten Altbestand, verfügbare Modelle, trockene Wege, Hauseingänge, Abstände und das zusammenhängende Wegenetz. Der Browser-Test öffnet die tatsächlich gebauten Editor-/Spieldateien und prüft Auswahl, Landschaftsvorschau und begehbare Orte.

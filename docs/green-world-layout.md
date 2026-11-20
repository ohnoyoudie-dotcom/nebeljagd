# Grünwald: Häuserblöcke, Wege und Geländehindernisse

Der neue Entwurf ersetzt ausschließlich den bisherigen automatischen Ausbau mit IDs `forest-world-`. Die 50 vorher handgesetzten Objekte, 88 Bodenmalereien, Küsten, Biome, Brücken und Spielregeln bleiben erhalten. Es wird kein Browserentwurf überschrieben.

Lindenwacht besteht aus 16 rechteckigen Blöcken mit schmalen Stadthäusern, kleinen Häusern, Eckhäusern und größeren Gasthäusern. Zwei 10 m breite Hauptstraßen kreuzen sich; weitere Straßen sind 7 m breit. Die Doppelhausblöcke haben ungefähr 12 m zwischen den Häuserfassaden. Die Häuser stehen rechtwinklig zum Straßennetz, mit verschiedenen Farben, Raumplänen und teilweise Hinterausgängen. Fünf kleine Dörfer und drei einzelne Hausstandorte ergänzen das Wegenetz. Nicht jede reservierte Parzelle wird bebaut: ungeeignete Standorte am Biomrand oder an Kreuzungen bleiben frei.

26 längliche, unregelmäßig verlaufende Hindernisflächen teilen den grünen Bereich in Lichtungen und Wegkorridore. Felsrücken und dichte Wälder verwenden die vorhandene Hindernismalerei, variierende Höhen und automatisch aufgesetzte Vegetation. Die Grundhöhen liegen zwischen 2,6 und 4,8 m. Wege behalten mindestens 5 m Abstand zur gemalten Hinderniskante. Eine zusätzliche westliche Verbindung schafft eine Umgehung der Stadt. Beide bestehenden Brücken bleiben erreichbar.

43 normale und 9 seltene Truhen, 80 Fässer und 52 Kisten verteilen sich auf Höfe, Dorfränder und Weglichtungen. Seltene Truhen besitzen eine freie Umgebung von mindestens 5,5 m Radius; kein Gegenstand blockiert eine Haustür. Die vorhandene Beute- und Öffnungsmechanik wird verwendet. Alle Platzierungen bleiben reguläre, einzeln bearbeitbare Editorobjekte. Es werden keine neuen Gegner oder zusätzlichen Waffen eingeführt.

`scripts/rebuild-green-world.js --write` erstellt den Entwurf deterministisch. Die Ausführung verweigert einen erneuten Ausbau, sobald IDs `green-world-` existieren, um anschließende manuelle Änderungen zu schützen. Hindernis-IDs beginnen mit `ridge-green-`. Der detaillierte Plan steht in `docs/green-world-layout.json`.

`tests/green_world.test.js` prüft den erhaltenen Altbestand, das zusammenhängende Wegenetz, Haustüren, Straßenabstände, Biomgrenzen, vorhandene Assetvarianten sowie zugängliche Beute. `tests/green_world_smoke.py` prüft die erzeugten Editor- und Spieldateien.

Beim importierten Waldbaum werden außerdem die braunen geschlossenen Kronen-Füllkörper nicht mehr gerendert. Blätter, echter Stamm und Verzweigungen bleiben erhalten. Der Test `tests/tree_crown_smoke.py` prüft sichtbare, transparente und wiederhergestellte Kronen.

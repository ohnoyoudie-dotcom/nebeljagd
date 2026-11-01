# Level durch besiegte Gegner

Ein Spieler startet auf **Level 1 mit maximal 100 Lebenspunkten**. Jeder
besiegte Gegner bringt unmittelbar einen Levelaufstieg: **+25 maximale und
+25 aktuelle Lebenspunkte**. Bereits erlittener Schaden bleibt damit erhalten;
ein Levelaufstieg heilt nicht automatisch vollständig.

| Level | Maximale Lebenspunkte | Abschnitte im Balken |
| --- | --- | --- |
| 1 | 100 | 4 |
| 2 | 125 | 5 |
| 3 | 150 | 6 |
| 4 | 175 | 7 |

Das Level steht links neben dem grünen Balken über der Spielfigur und in der
Lebensanzeige unten links. Jeder Abschnitt entspricht 25 Lebenspunkten. Die
Breite des Balkens bleibt unverändert; mit jedem Level werden die Abschnitte
schmaler. Die Anzeige für aktuelle und maximale Lebenspunkte sowie die
zugänglichen Beschriftungen folgen dem tatsächlichen Wert.

Der tödliche Treffer zählt für seinen Verursacher. Das gilt auch für einen
Gegner, der durch nachwirkenden Brandschaden stirbt. Ein bereits besiegtes Ziel
bringt keine weiteren Level; zerstörbare Kisten zählen nicht als Gegner. Die
Kampfregel behandelt neutrale Gegner und gegnerische Spielerfiguren gleich.
Der aktuelle Browserprototyp hat weiterhin lokale Übungsgegner; echte
Mehrspielerpartien sind noch nicht aktiv.

Herzen heilen weiterhin um bis zu 25 Lebenspunkte, auch oberhalb von 100 bis
zum neuen Maximum. Bei einem Rundenneustart gelten wieder Level 1, maximal
100 und die bisherigen 72 Startlebenspunkte. Fortschritt wird für die laufende
Runde gespeichert.

Die Übungswiese beginnt weiterhin mit vollen 100 Lebenspunkten. Auch dort
erhöhen besiegte Übungsgegner Level und Maximum; der Übungsmodus hält die
aktuellen Lebenspunkte am jeweiligen Maximum. Zurücksetzen beginnt wieder
bei Level 1 und 100/100 Lebenspunkten.

## Umsetzung

`src/combat.js` meldet jeden Übergang von lebendig zu besiegt genau einmal und
bewahrt den Verursacher eines Brandes. `src/progression.js` vergibt den
Levelaufstieg an den zugehörigen lebenden Spieler. `src/main.js` verbindet dies
mit Heilung, HUD und schwebender Anzeige. Die Kampflogik lässt sich für weitere
Spieler-IDs verwenden, ohne den beobachtenden lokalen Spieler mitzubelohnen.

`tests/progression.test.js` prüft Zuschreibung, neutrale und Spielerziele,
Brandkills, Mehrfachtreffer, ausgeschlossene Ziele, Heilung und Rundenneustart.
Die Lebensbalkentests prüfen Unterteilung, konstante Breite und gemeinsame
Sichtbarkeit von Level und Balken. `tests/level_progression_smoke.py` prüft
echte Waffenangriffe, Levelaufstiege, Heilung und Anzeigen im Browser auf einer
importierten Testkarte. Die Projektkarte wird dabei nicht verändert.

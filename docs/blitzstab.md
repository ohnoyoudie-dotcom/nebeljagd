# Blitzstab · kompaktes Gewitterauge

Im Editor unter **Objekte → Einzeln → Blitzstab · Tripo** platzieren.
Das hochgeladene Original und die optimierte Laufzeitkopie des Stabs bleiben unverändert.

**F, linke Maustaste oder Touch-Angriff halten**, mit Maus bzw. Stick die einfache
runde Zielfläche setzen und loslassen. Der Reichweitenkreis wächst wie beim Gift-
und Gravitationsstab in **3 Sekunden von 0 auf 20 Meter**. Frühes Loslassen wählt
entsprechend weniger Reichweite. Die Zielwahl darf über Mauern hinweg erfolgen.
Rolle, Pause und Waffenwechsel brechen eine laufende Zielwahl ab.

Beim Loslassen bildet sich direkt über der gewählten Fläche ein kompaktes,
halbtransparentes blau-graues Gewitterauge. Sein sichtbarer Radius beträgt höchstens
1,75 m, die dezente Bodenfläche hat **4,8 m Radius**. Wolkenfalten drehen langsam,
Blitze leuchten kurz auf. Figuren erhalten bei Betäubung einen kleinen elektrischen
Bogen über dem Kopf und eine kurze Körperreaktion. Der Boden bleibt sichtbar.

Nach 0,25 s Öffnung dauert das Gewitter **3 s**, gefolgt von 0,25 s Ausblenden.
Fünf unregelmäßig verteilte Einschlagswellen erzeugen Blitze an wechselnden Stellen
sowie zu erreichbaren Gegnern in der Fläche. Jede Welle verursacht ein Fünftel des
Waffenschadens und **0,4 s Betäubung**: Bewegung hält an, anschließend ist sie bis
zum nächsten Treffer wieder möglich. Wer alle fünf Wellen abbekommt, erhält insgesamt
23 Grundschaden; Seltenheit skaliert wie bisher nur den Schaden. Besitzer und
zerstörbare Objekte werden ausgespart. Hohe Deckung auf dem Weg vom Auge zum Gegner
blockiert den Einschlag. Verdeckte Gegner werden durch Effekte nicht verraten.

Die bisherige Abklingzeit von 0,9 s bleibt erhalten; solange ein Gewitter aktiv ist,
kann kein zweites gesetzt werden. Pause friert Aufladung und Gewitter vollständig
ein. Neustart entfernt das Feld und alle Blitze.

Die Wolke ist ein kleines prozedurales Material ohne neue Texturdownloads. Bodenfläche,
Wolke, Blitzband-Puffer und instanzierte Einschlagsfunken benötigen zusammen vier
Zeichenschritte. Maximal 24 sichtbare Blitze werden wiederverwendet; zusätzliche
Gegner verändern diese Darstellungsgrenze nicht. Keine dynamischen Lichtquellen oder
Bildschirm-Nachbearbeitung. Die ehemalige gerade Projektil-Attacke wird ersetzt.

Prüfung: `npm test`, `npm run verify:assets`, `npm run build` und
`NEBELJAGD_URL=http://127.0.0.1:4177 python tests/lightning_staff_smoke.py`.
Der Browsertest prüft Editor, Stabmodell, echte Maus-/Touch-Eingabe, Aufladung,
Gewitter, Schaden, tatsächlichen Bewegungsstopp, Pause, Erholung und Neustart.

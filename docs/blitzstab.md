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
2,5 m einschließlich des bewegten Dunstes, die dezente Bodenfläche hat **4,8 m Radius**. Die Wolke verwendet nun
Artwork aus der freigegebenen Gewitter-Referenz: dunkle Wolkentiefen, silberblaue
Kanten, feine Dampffahnen und inneres Wetterleuchten. Zwei zur Kamera gerichtete
Ebenen animieren das etwa 20 Prozent größere Artwork mit unterschiedlich
strömenden Dampfrändern, sanftem Aufwallen und wanderndem Wetterleuchten.
24 Abschnitte bilden den hellen Hauptblitz, fünf feinere Nebenäste verzweigen
sich daraus. Drei kurze Rückentladungen pro Einschlag bleiben kräftig; dazwischen
erlischt der Blitz vollständig. Bodenentladungen und Funken markieren die Treffer.
Bereits sichtbare Figuren erhalten weiche Aussparungen in der Wolke.

Nach 0,25 s Öffnung dauert das Gewitter **3 s**, gefolgt von 0,25 s Ausblenden.
Jede der fünf Einschlagswellen erzeugt fünf unabhängig zufällig verteilte
Bodenblitze statt bisher drei: insgesamt 25, zusätzlich zu den Blitzen auf
erreichbare Gegner. Die Punkte verteilen sich über die gesamte Kreisfläche,
einschließlich der Mitte, ohne feste Winkelabstände oder umlaufendes Muster.
Jeder Einsatz erhält neue Punkte; Pause und Bildrate ändern sie nicht. Jede Welle verursacht ein Fünftel des
Waffenschadens und **0,4 s Betäubung**: Bewegung hält an, anschließend ist sie bis
zum nächsten Treffer wieder möglich. Wer alle fünf Wellen abbekommt, erhält insgesamt
23 Grundschaden; Seltenheit skaliert wie bisher nur den Schaden. Besitzer und
zerstörbare Objekte werden ausgespart. Hohe Deckung auf dem Weg vom Auge zum Gegner
blockiert den Einschlag. Verdeckte Gegner werden durch Effekte nicht verraten.

Die bisherige Abklingzeit von 0,9 s bleibt erhalten; solange ein Gewitter aktiv ist,
kann kein zweites gesetzt werden. Pause friert Aufladung und Gewitter vollständig
ein. Neustart entfernt das Feld und alle Blitze.

Das einmal geladene 768×768-WebP mit Alpha benötigt rund 79 KiB komprimiert
und 3 MiB einschließlich Mipmaps im GPU-Speicher. Es wird offline ins Spiel
eingebettet und über alle Einsätze geteilt. Die Wolke benötigt vier Dreiecke;
der gesamte Effekt sechs Zeichenschritte mit höchstens 24 sichtbaren Blitzen
und 144 gepoolten Funken. Keine dynamischen Lichtquellen oder Nachbearbeitung.
Quelle, Generierungsprompt, Hashes und Budgetprüfung liegen unter
`assets/effects/thunder-reference/`.

Prüfung: `npm test`, `npm run verify:assets`, `npm run build` und
`NEBELJAGD_URL=http://127.0.0.1:4177 python tests/lightning_staff_smoke.py`.
Der Browsertest prüft Editor, Stabmodell, echte Maus-/Touch-Eingabe, Aufladung,
Gewitter, Schaden, tatsächlichen Bewegungsstopp, Pause, Erholung und Neustart.
Zusätzliche Spielaufnahmen zeigen die zweite Entladung und die Pause zwischen
zwei Einschlagswellen, damit nicht nur der hellste Moment beurteilt wird.

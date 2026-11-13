# Blitzstab · kompaktes Gewitterauge

Im Editor unter **Objekte → Einzeln → Blitzstab · Tripo** platzieren.
Das hochgeladene Original und die optimierte Laufzeitkopie des Stabs bleiben unverändert.

**F, linke Maustaste oder Touch-Angriff halten**, mit Maus bzw. Stick die einfache
runde Zielfläche setzen und loslassen. Der Reichweitenkreis wächst wie beim Gift-
und Gravitationsstab in **3 Sekunden von 0 auf 20 Meter**. Frühes Loslassen wählt
entsprechend weniger Reichweite. Die Zielwahl darf über Mauern hinweg erfolgen.
Rolle, Pause und Waffenwechsel brechen eine laufende Zielwahl ab.

Beim Loslassen bildet sich direkt über der gewählten Fläche ein blau-graues
Gewitterauge. Die Ziel- und Wirkungsfläche hat jetzt **3,8 m Radius** statt 4,8 m;
der Durchmesser sinkt von 9,6 auf 7,6 m. Die Wolke wird gleichzeitig etwa 15 Prozent größer (mit Dunst bis 2,85 m Radius)
und füllt dadurch mehr von der kleineren Fläche aus. Sie verwendet weiterhin das
Artwork aus der freigegebenen Gewitter-Referenz: dunkle Wolkentiefen, silberblaue
Kanten, feine Dampffahnen und inneres Wetterleuchten. Ruhigere Bewegung und klarere
Helligkeitsunterschiede zwischen Unterseite und beleuchteten Wolkenballen lassen
die Wolke plastischer wirken.
Der Hauptblitz läuft von einer kräftigen Basis zu einer schmalen Spitze aus und
hat unregelmäßige Knicke. Zwei kräftigere Gabelungen und drei feine Nebenäste
variieren in Ansatzpunkt, Länge, Richtung und Stärke. Kurze, versetzte
Entladungen mit dunklen Pausen beleben die Einschläge. Auslaufende
Bodenentladungen mit rund 36 Prozent kleinerer Ausdehnung und gedämpften Ausläufern, flach wegsprühende Funken und kurze erdige Staubstöße markieren
die Treffer. Ein weicher, leicht bewegter Schatten verbindet die Wolke mit dem
Boden. Der aktive Flächenrand bleibt dezent; die runde Zielanzeige behält ihren
gewohnten Stil und zeigt den verkleinerten Wirkungsradius an.
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
eingebettet und über alle Einsätze geteilt. Die Wolke benötigt 384 Dreiecke für sanfte Bewegung von Körper und Dunst; der gesamte Effekt sieben Zeichenschritte mit höchstens 24 sichtbaren Blitzen
und 144 gepoolten Funken sowie 24 kurzlebigen Staubstößen. Keine dynamischen Lichtquellen oder Nachbearbeitung.
Quelle, Generierungsprompt, Hashes und Budgetprüfung liegen unter
`assets/effects/thunder-reference/`.

Prüfung: `npm test`, `npm run verify:assets`, `npm run build` und
`NEBELJAGD_URL=http://127.0.0.1:4177 python tests/lightning_staff_smoke.py`.
Der Browsertest prüft Editor, Stabmodell, echte Maus-/Touch-Eingabe, Aufladung,
Gewitter, Schaden, tatsächlichen Bewegungsstopp, Pause, Erholung und Neustart.
Zusätzliche Spielaufnahmen zeigen die zweite Entladung und die Pause zwischen
zwei Einschlagswellen, damit nicht nur der hellste Moment beurteilt wird.

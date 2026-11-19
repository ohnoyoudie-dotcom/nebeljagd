# Startpunktwahl und Teleport

Das lokale Inselspiel beginnt mit einer scharfen, bildschirmfüllenden Inselkarte statt des bisherigen Kometenflugs. Die Originalfigur und die verfasste Weltkarte bleiben unverändert.

- „Spiel starten“ öffnet eine achtsekündige Auswahlphase. Ein Klick oder Fingertipp wählt den Startpunkt; bis zum Ablauf kann er geändert werden. Es gibt keinen zusätzlichen Bestätigungsbutton.
- Der bereits markierte, geprüfte Startpunkt wird bei Untätigkeit übernommen. Wasser, Kartenränder und Hindernisse werden über dieselbe Weltkollision wie im Spiel geprüft. Ungültige Klicks überschreiben die letzte gültige Auswahl nicht.
- Tastatur: Karte mit Tab fokussieren, Cursor mit Pfeiltasten verschieben, mit Enter auswählen. Escape pausiert auch den Countdown.
- Nach Ablauf wird die Auswahl für 1,2 Sekunden gesperrt und anschließend in 0,8 Sekunden zum Spiel übergeblendet. Die Figur materialisiert sich mit einem kurzen blau-violetten Lichtimpuls und wenigen Partikeln. Es gibt keinen dauerhaften Bodenkreis und keine Nähe-Nachricht.
- Kampf, Bewegung und Spielzeit beginnen erst nach dem Teleport. Neustart öffnet die Auswahl erneut. Die Übungswiese behält ihren direkten Einstieg.
- Während Auswahl und Bestätigung wird die verdeckte 3D-Szene weder aktualisiert noch gerendert. Die Karte verwendet den vorhandenen 1024-Pixel-Atlas. Zusätzliche Terrainkopien und die Flugkamera werden nicht mehr erzeugt.

## Grenze des aktuellen Spiels

Das Inselspiel besitzt noch keine Netzwerk-Spielersynchronisation; der Klassenserver verwaltet lediglich Zugänge und Übungsräume. Deshalb zeigt die Startkarte nur den eigenen Punkt. Sie erfindet keine Mitspieler und sendet keine Positionen an andere Geräte.

Für den vereinbarten gemeinsamen Start braucht der spätere Spielserver eine autoritative Rundenuhr und Spawn-Zuweisung: Auswahl zunächst nur an den jeweiligen Spieler zurückgeben; nach Sperrung die bestätigten Startpunkte gemeinsam veröffentlichen; Teleport zur gemeinsamen Startzeit auslösen. Mindestabstände und Konflikte muss ebenfalls der Server auflösen. Dieses Update behauptet keine Umsetzung dieser noch fehlenden Mehrspielerfunktion.

## Prüfung

`tests/map-arrival.test.js` prüft Phasen, Sperre, Pause, Wiederholung, ungültige Ziele, Kartenkoordinaten und begrenzte, verankerte Teleportpartikel. `tests/map_start_smoke.py` prüft den Ablauf im erzeugten Spiel einschließlich Maus, Touch, Pause, Neustart und unveränderter Karte.

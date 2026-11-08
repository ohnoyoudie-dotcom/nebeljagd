# Wege und lokale Sichtbarkeit

Die Wegränder bestehen aus unregelmäßigen Steingruppen mit deutlich freien
Abschnitten. Einzelne Steine wechseln sich mit kleinen und großen Gruppen ab;
auch innerhalb einer Gruppe variieren Größe, Ausrichtung, Form und Abstand.
Die Verteilung bleibt beim erneuten Laden stabil. Jeder Wegbelag verwendet
eine passende Farb- und Größenpalette. Bereits gespeicherte Wegstriche mit
Härte 0,55 erhalten die Ergänzungen automatisch, ohne erneut gemalt zu werden.
Gemalte Wege folgen ihrer gemeinsamen sichtbaren Außenkontur, damit sich an
überlappenden Pinselstrichen keine inneren Randreihen bilden. Weiche Biomflächen
erhalten durch diese Ergänzung keine Steinumrandung.

Steht die eigene Figur unter einer Baumkrone, wird das betreffende Laub weich
durchscheinend, bis auf 4,5 Prozent Deckkraft im Zentrum. Die Überblendung beginnt
bereits am äußeren Kronenrand und reagiert mit einer Zeitkonstante von 0,06 s,
damit auch kurze Durchquerungen sichtbar bleiben. Beim Verlassen stellt sich
die normale Darstellung weiterhin sanft mit 0,32 s wieder her.
Stämme, Blattmasken, Windbewegung und die individuellen Biomfarben bleiben Teil
der vorhandenen Baumdarstellung. Die Aufhellung ist eine lokale Sichthilfe;
die Regeln für Hindernisse und die Sichtbarkeit anderer Figuren bleiben bestehen.

In Versteckgras wird die eigene Figur durchscheinend mit einer sanften,
schmalen hellen Kontur dargestellt. Eine leicht weißere Füllung und Kontur
heben die Figur vom Versteck ab, die ursprünglichen Kleidungsfarben bleiben
erkennbar. Die Darstellung liegt zwischen der früheren kräftig weißen
Silhouette und der zurückhaltenden getönten Fassung.
Der Übergang und die Rückkehr zur normalen Darstellung
sind weich. Die Kontur folgt dem animierten Körper und berücksichtigt die
Schneeoberfläche. Die bestehende Spielregel, ob eine Figur verborgen ist, steuert
weiterhin den Zustand.

Die Browserprüfung `tests/path_canopy_concealment_smoke.py` verwendet temporäre
Spieltestkarten und die erzeugte Browserfassung. Die gespeicherte Projektkarte
und Originalmodelle werden durch die Prüfung nicht verändert. Messwerte und
Prüfbilder liegen unter `test-results/path-canopy-concealment/`.

`tests/path_refinement_smoke.py` prüft zusätzlich Kopien der tatsächlichen
gespeicherten Wegstriche mit unveränderten Pinseleinstellungen sowie die
sanftere Darstellung beim Betreten, Verlassen und Neustarten im Versteck.
Die Testkopien verändern die Projektkarte nicht.

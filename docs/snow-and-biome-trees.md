# Schneekontakt und Bäume je Biom

Die bisherige gemeinsame Grenze von 96 Schneespuren entfernte beim nächsten
Abdruck den ältesten Eintrag, auch wenn er noch sichtbar war. Schritte,
Übungsgegner und dicht unterteilte Rollspuren konkurrierten dabei um dieselben
Plätze. Die Spurverwaltung entfernt abgelaufene Einträge vor dem Hinzufügen
neuer Spuren. Lebende Abdrücke werden nicht mehr für neue verdrängt. Das
Ausblenden bleibt zeitabhängig: ab sechs Sekunden, vollständig nach zehn
Sekunden. Ein begrenztes, aus der maximalen Bewegungs- und Abtastrate
abgeleitetes Budget hält den Speicherverbrauch kontrollierbar.

Die Rolle zeichnet Bodenkontakt statt einer durchgehenden Linie: Nach dem
Absprung beginnt die Spur verzögert und besteht aus unterschiedlich langen,
weich auslaufenden Druckstellen mit Lücken. Die Form bleibt entlang des
zurückgelegten Wegs stabil und folgt weiterhin der Geländeoberfläche. Rollen
erzeugen keine Schuhabdrücke; beim anschließenden Gehen erscheinen wieder
normale Schritte.

Jeder Baum erhält eine aus seiner Kennung bestimmte Farbvariation. Dadurch
behält er seinen Rindenton beim Neuladen und Verschieben. Die Blätter mischen
diese individuelle Variation mit dem Biom an seinem Standort: verschiedene
Grüntöne auf Wiese und im Wald, gedämpftes Grün im Sumpf, trockene Töne in der
Wüste und fleckige helle Frostakzente im Schnee. Übergänge und gemalte Biome
nutzen dieselben Gewichte wie das Gelände.

Die Darstellung verwendet weiterhin die vorhandenen Modelle, Blattmasken,
Texturen und Windbewegung. Die Originaldateien, gespeicherten Baumpositionen
und Kollisionskörper bleiben erhalten. Die Laufzeitfarben benötigen keine
zusätzlichen Baumvarianten in der Objektauswahl.

Die automatisierten Prüfungen decken lange Schneeläufe, gemischte Quellen,
Überlast, zeitabhängiges Ausblenden und die stabile Farbzuordnung ab.
`tests/snow_tree_variation_smoke.py` prüft die erzeugte Browserfassung mit
normalen Bewegungs- und Rolltasten sowie einer temporären Testkarte. Bilder und
Messwerte liegen unter `test-results/snow-tree-variation/`; die bearbeitete
Projektkarte wird dafür nicht verändert.

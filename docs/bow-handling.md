# Bogen: Haltung und bewegliches Zielen

Beim Halten folgt die gesamte Bogenhaltung der aktuellen Bewegungsrichtung.
Loslassen verwendet nochmals die aktuelle Richtung, auch zwischen zwei Frames.
Aufladung bleibt beim Richtungswechsel erhalten; ein Loslassen schießt genau
einen Pfeil. Rollen, Abbruch, Waffenwechsel und Neustart brechen das Spannen ab.

Der gehaltene Bogen ist rund 34 % größer. Aufgelegter und fliegender Pfeil
behalten die vorherigen Maße (`ARROW_LENGTH = 1.05`, Querschnittsfaktor 1.65),
weil der Nutzer den Pfeil im Vergleich zum Bogen bereits zu groß findet.
Der linke Griff liegt weiter vorn auf der rechten Schulterlinie.
Beide Handflächen werden am tatsächlichen Griff beziehungsweise an der
beweglichen Sehne ausgerichtet. Die rechte Armbeuge bleibt rechts außerhalb
des Oberkörpers. Der einfache Holzbogen erhält einen kürzeren Auszug, damit seine
tiefere Ausgangsform die Zughand nicht hinter die Schulter zieht.

Prüfungen: `bow_alignment.test.js` (Sehne, Richtung, Freigabe und Abbruch),
`bow_pose.test.js` (echter Avatar und beide Bögen bei Stand/Gehen),
`bow_alignment_smoke.py` (gebautes Spiel, Tastatur und Zweifinger-Touch:
links halten, nach oben wechseln, vollständig gespannt bleiben, nach oben feuern).

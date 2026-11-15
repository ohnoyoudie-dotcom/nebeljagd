# Unabhängig bewegen und zielen

Am PC laufen WASD/Pfeile weiter unabhängig von der Maus. Ein Klick oder F
beginnt die Zielgeste; Loslassen löst genau einen Angriff aus. Zusätzliche Richtungslinien, Erdbrecher-Streifen und Flugkurven entfallen.
Die vorhandenen Bodenmarkierungen der Artillerie und Flächen sowie ihre
aufladbare Reichweite bleiben erhalten.
Die Maus bestimmt den Bodenpunkt; große Entfernungen werden wie bisher begrenzt.

Auf Touch-Geräten bleibt der linke Stick ausschließlich für Bewegung zuständig.
Der rechte Angriffsknopf ist zugleich Zielstick: Ziehen wählt die Richtung,
bei Artillerie und Flächen zusätzlich die Entfernung innerhalb der bereits
aufgeladenen Reichweite. Kleine Bewegungen bis 8 Pixel ändern die Richtung
nicht. Ein kurzes Tippen nutzt die letzte Zielrichtung (anfangs die Blickrichtung).
Loslassen des Bewegungssticks stoppt nur die Bewegung. Loslassen des Zielsticks
löst den Angriff aus. Pointer-Abbruch, Pause, Rollen und Waffenwechsel brechen
eine noch nicht ausgelöste Zielgeste ab. Escape bricht zunächst das Zielen ab;
sonst öffnet es wie bisher die Pause. Der Schutzstab bleibt ein direkter Knopfdruck.

Blickrichtung folgt dem Ziel; Bewegung und Rollen nutzen die Laufrichtung.
Der Schrittrhythmus läuft stets vorwärts. Eine reversible Beinanpassung richtet
die Schritte nach der tatsächlichen Bewegung aus, mit kürzeren seitlichen
Schritten und getrennten Fußbahnen. Projektilrichtung wird
beim Auslösen festgehalten, auch wenn die Maus während der Zauberanimation
weiterbewegt wird. Kollisionen, Schäden und die Reichweiten der Waffen bleiben
in den vorhandenen Waffen-Controllern.

Prüfung der Laufanimation am echten Modell: `tests/directional_gait.test.js`
und `tests/directional_gait_smoke.py` (seitlich, rückwärts und diagonal mit
entgegengesetztem Mausziel). Eingabeprüfung: `tests/independent_aim.test.js` und
`tests/independent_aim_smoke.py`. Der Browser-Test prüft gegensinniges Laufen und
Schießen, Abbruch, Flächenwahl, zwei gleichzeitige Touch-Pointer, getrenntes
Loslassen und Artillerie mit variabler Entfernung. Bilder und Zustände liegen
unter `test-results/independent-aim/`. Die vorhandene Karte wird nicht verändert.

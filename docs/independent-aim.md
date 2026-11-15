# Unabhängig bewegen und zielen

Am PC laufen WASD/Pfeile weiter unabhängig von der Maus. Ein Klick oder F
beginnt die Zielgeste; Loslassen löst genau einen Angriff aus. Bei Projektilen
erscheint eine kurze Richtungslinie, beim Erdbrecher der wachsende Streifen.
Meteor, Gift und Gravitation ergänzen ihre vorhandene Landemarkierung um eine
Flugkurve. Flächenzauber behalten ihre Zielmarkierung und aufladbare Reichweite.
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
Beim Rückwärtslaufen läuft die Laufanimation rückwärts. Projektilrichtung wird
beim Auslösen festgehalten, auch wenn die Maus während der Zauberanimation
weiterbewegt wird. Kollisionen, Schäden und die Reichweiten der Waffen bleiben
in den vorhandenen Waffen-Controllern.

Prüfung: `tests/independent_aim.test.js` und
`tests/independent_aim_smoke.py`. Der Browser-Test prüft gegensinniges Laufen und
Schießen, Abbruch, Flächenwahl, zwei gleichzeitige Touch-Pointer, getrenntes
Loslassen und Artillerie mit variabler Entfernung. Bilder und Zustände liegen
unter `test-results/independent-aim/`. Die vorhandene Karte wird nicht verändert.

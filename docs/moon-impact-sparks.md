# Funken beim Aufprall der Mondsichel

Die Mondsichel erzeugt beim Kontakt mit einem Hindernis zehn kurze, helle
Funken. Sie starten an der berechneten Kontaktstelle, fliegen von der Oberfläche
weg, fallen leicht ab und verblassen innerhalb von 0,26 bis 0,425 Sekunden.
Eine bereits an der Stabspitze blockierte Sichel löst denselben Effekt aus.
Die normale Umkehr am Reichweitenende erzeugt keinen Aufprall; Treffer an
Figuren behalten ihre vorhandene Darstellung und Schadenslogik.

Der Effekt nutzt einen Pool mit höchstens 32 länglichen Partikeln und einem
Instanz-Aufruf. Er berücksichtigt Sichtbarkeit und Tiefenprüfung, friert bei
Pause ein und wird beim Neustart entfernt. Rückkehr, Reichweite und Schaden
der Sichel bleiben erhalten; es gibt keine zusätzlichen Lichter oder Texturen.

Geprüft mit `tests/moon_impact_sparks.test.js`, der vollständigen Testsuite und
`tests/moon_projectile_smoke.py` gegen das generierte `welt/magebrawl.html`.
Die Browserprüfung umfasst Figuren, Mauer und ein erhöhtes Fass, einschließlich
Pause, Ablauf und Neustart; sie verändert die gespeicherte Weltkarte nicht.

# Runde Goldmünze

Goldbeute verwendet eine einzelne direkt im Code erzeugte Münze statt vier
überlappender Scheiben. Ein gespiegeltes Rotationsprofil bildet zwei identische,
glatte Seiten mit einer schmalen Nut und einem abgerundeten Goldrand. Die Farben
sind ebenfalls gespiegelt. Texturen, Schrift, Prägungen und externe Modelle sind
nicht erforderlich. Geometrie und Material werden zwischen allen Münzen geteilt.

Die sichtbare Münze hat bei normaler Größe etwa einen Meter Durchmesser und ist
zur Spielkamera geneigt. Sie dreht sich im Uhrzeigersinn mit 0,32 Radiant pro
Sekunde, also ungefähr einer Umdrehung in 20 Sekunden. Leichtes Schweben und ein
kleiner Lichtreflex bleiben erhalten; Rotation und Schweben halten bei Pause an.
Die Goldmenge, der Auswurf aus Truhen, das Einsammeln und die Regeln für Sicht
und Hindernisse bleiben erhalten. Der bisherige rosa Bodenschein ist bei Gold
nun goldfarben.

Prüfung: gespiegelte Positionen, Normalen und Farben; Drehrichtung in der
Spielkamera, langsame kontinuierliche Bewegung und Pause; echte Truhenöffnung,
Aufnahme und Neustart in `tests/chest_loot_browser_smoke.py`. Die Prüfkarte wird
nur im temporären Browserprofil angelegt; die Projektkarte bleibt unverändert.

# Projektile und niedrige Mauern/Zäune

Freistehende Mauern und Zäune unter 2 m lassen jetzt sowohl Sicht als auch
Fernkampfprojektile passieren. Ab genau 2 m gilt wieder die tatsächliche
Kollision mit dem Hindernis. Die gemeinsame Höhenregel verwendet Weltmeter,
auch bei skalierten, gedrehten und als Linie gezeichneten Barrieren.

Die Regel gilt für Pfeile, Feuer-, Eis-, Stern-, Mond- und Giftprojektile,
einschließlich der Prüfung zwischen Spielfigur und Waffenspitze. Nach einer
übersprungenen niedrigen Barriere wird weiterhin das nächste Hindernis geprüft.
Der Giftbogen behält seine hohe Flugkurve und kann Hindernisse tatsächlich
überfliegen; beim Auftreffen auf ein höheres Hindernis endet er dort.

Bewegung, Nahkampf, Aufheben und Giftwolken nutzen weiterhin die vollständigen
physischen Hindernisse. Häuser, Baumstämme und zerstörbare Gegenstände behalten
ihre Kollisionen. Karte und Biomeinstellungen werden nicht verändert.

`tests/projectile_barriers.test.js` prüft Grenzhöhen, Gelände-/Modellskalierung,
mehrere Hindernisse, Öffnungen, unmittelbare Abschüsse, Flug und Giftlandung.
`tests/projectile_barriers_smoke.py` prüft alle sechs Waffen mit ihren geladenen
Modellen im generierten Spiel gegen niedrige und hohe Mauern sowie gedrehte und
gezeichnete Zäune. Der Workflow führt diese Browserprüfung vor Veröffentlichung aus.

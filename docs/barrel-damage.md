# Gemeinsamer Schaden an Fässern

Ein normales Tripo-Fass behält seine 60 Lebenspunkte. Schwert, Bogen und
Zauberstäbe verwenden denselben Schadensweg; Waffenschaden und Seltenheitsstufe
bestimmen die benötigten Treffer. Feuer und Gift behalten ihre zeitlichen
Schadenseffekte. Zerstörte Gegenstände geben weiterhin keinen Levelaufstieg.

Die tatsächliche Hindernisfläche wird ihrem zerstörbaren Kampfziel zugeordnet.
So verursacht auch ein Treffer am äußeren Fassrand Schaden, wenn der einfachere
Zielzylinder in diesem kurzen Simulationsschritt noch nicht erreicht wurde.
Nähere Gegner und Hindernisse behalten ihre Priorität. Ein nicht zerstörtes Fass
stoppt gewöhnliche Projektile; die vorhandenen Sonderregeln der Mondsichel
für Hin- und Rückflug bleiben bestehen.

Da die Steuerung nur eine horizontale Zielrichtung vorgibt, senkt sich der
Bogen beim direkten Anvisieren eines erreichbaren niedrigen Gegenstands etwas
ab. Pfeil, Bogen und Flugrichtung folgen dieser Neigung. Die horizontale
Richtung bleibt unverändert, ein anderes Hindernis vor dem Ziel verhindert
diese Anpassung. Es entstehen keine vergrößerten unsichtbaren Trefferflächen.

Giftwolken können erreichbare zerstörbare Gegenstände treffen. Nur deren eigene
Oberfläche zählt dabei nicht als vorgeschobenes Hindernis; Mauern und andere
Gegenstände schirmen weiterhin ab. Die getrennte Regel für Fernkampf über
niedrige Mauern und Zäune bleibt in `projectile-barriers.md` beschrieben.

Die gezielten Projektiltests prüfen reale Fasskollisionen, kurze und lange
Zeitschritte, verdeckte Ziele, zurückgesetzte Gegenstände sowie die Ausrichtung
des Bogens. `tests/canopy_barrel_smoke.py` prüft im erzeugten Spiel echte Angriffe
mit Schwert, Bogen und Eisstab, den berechneten Lebenspunkteverlauf, eine hohe
Mauer, Bruchstücke und Neustart. Testkarten werden nur im temporären Browser
verwendet; die gespeicherte Projektkarte und Originalmodelle bleiben erhalten.

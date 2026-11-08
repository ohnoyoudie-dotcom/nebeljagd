# Schwertbewegung und Trefferbild

Aufeinanderfolgende Angriffe wechseln zwischen diagonalem Hieb, aufsteigendem
Gegenschlag und einem Schlag von oben. Hände, Oberkörper und Stand folgen dem
jeweiligen Muster. Nach einer Pause von 0,9 Sekunden nach dem Schlag sowie
nach Rollen, Waffenwechsel oder Neustart beginnt die Folge wieder von vorn.

Die kurze Lichtspur entsteht aus den tatsächlich gemessenen Positionen der
Klinge. Eine feine helle Außenkante, ein transparentes Band und ein schwaches
Nachbild zeigen die Bewegung; wenige gerichtete Lichtsplitter begleiten sie.
Bestätigte sichtbare Treffer erzeugen einen kurzen Funkenimpuls. Die Spur wird
räumlich verdeckt und folgt der Sichtbarkeit der Figur. Ihre Geometrie und
Partikel werden wiederverwendet; sie benötigt höchstens zwei Zeichenaufrufe.

Schaden, Reichweite, Abklingzeit und der bisherige Trefferzeitpunkt bleiben
unverändert. Auch der dritte Schlag verursacht keinen zusätzlichen Schaden.
Abgewiesene Eingaben während der Abklingzeit überspringen keinen Schlag. Pro
Angriff kann ein Ziel einmal getroffen werden; Hindernisse blockieren den Treffer.

`tests/sword_motion.test.js` prüft die Folge, Übergänge, Abbrüche, Treffer und
die Übereinstimmung zwischen Klinge und Spur auch bei transformierter Szene.
`tests/cast_stance.test.js` prüft das reversible Überlagern der echten Figur.
`tests/level_up_feedback_smoke.py` prüft die erzeugte Spieldatei mit tatsächlichen
Tastatureingaben: drei verschiedene Schläge, einen echten Kill samt Körperglanz,
unveränderte Lebensbalken, Ablauf, blockierten Treffer und Neustart.

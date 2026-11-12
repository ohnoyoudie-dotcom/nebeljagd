# Sanduhrstab · erster spielbarer Stand

Der hochgeladene Sanduhrstab setzt ein **Zeitfeld an einer Zielfläche**. Er
verschießt kein Projektil und zieht Gegner nicht zur Mitte. Angriff halten
vergrößert die Reichweite; Maus beziehungsweise Touch-Stick wählen die Richtung.
Loslassen setzt das Feld. Abbrechen, Waffenwechsel und Ausweichrolle verwerfen
die Zielauswahl wie bei den vorhandenen Flächenstäben.

## Ablauf und vorläufige Spielwerte

- Bis 20 m Zielreichweite nach 3 s Halten, linear wie beim Giftstab.
- 3,2 m Feldradius; 0,6 s sichtbare Vorwarnung ohne Wirkung.
- 4 s aktives Feld: Verlangsamung beginnt bei 15 % und wächst innerhalb von
  2,2 s Aufenthalt bis maximal 65 %. Kein Schaden, kein vollständiger Stillstand.
- Beim Verlassen erholt sich das Ziel innerhalb von 0,25 s. Wiedereintritt
  beginnt erneut mit der schwachen Wirkung. Mit Eis oder anderen Zeitfeldern
  zählt die stärkste Verlangsamung; Faktoren werden nicht multipliziert.
- 0,85 s Auflösung: Die Sandbahnen brechen auf, Körner setzen sich und verblassen.
- 3,1 s Cooldown ab Loslassen; ein Feld pro Besitzer, erneutes Setzen ersetzt es.
- Seltenheit verändert diese Kontrollwirkung nicht. Mauern schützen Gegner;
  Wasser ist kein gültiges Ziel. Gegner werden durch den Status nicht aufgedeckt.

Diese Werte sind ein erster Teststand, keine endgültige Balanceentscheidung.

## Darstellung und Modell

Der gemeinsame Zielindikator verwendet einen klaren Ring mit feinen wandernden
Funken und weichem Saum, in Grün, Violett, Blitzblau oder Sandgold passend zum Stab. Die
Zielsteuerung und Vorwarnzeiten vorhandener Waffen bleiben erhalten.

Das Zeitfeld baut sich als körperlicher Sandwirbel auf: Zwei schraubenförmige
Sandböen steigen vom Boden auf und tragen 64 weiche, unregelmäßige Staubwolken.
2.400 einzelne Sandkörner kreisen gleichmäßig über die gesamte Kreisfläche, auch im Zentrum, bis etwa 2,5 m über dem Boden.
Beige, Ocker und warme Goldtöne geben dem Staub Licht und Schatten. Durchscheinende
Staubschichten lassen Spielfiguren und Boden erkennen. Die 64 Wolken verteilen
sich über die Fläche, statt nur zwei schmale Wirbelbahnen zu besetzen. Der Rand markiert
zunächst die Vorwarnung und tritt nach dem Öffnen zurück. Das Feld enthält
keine blaue Bodenfüllung, Runenscheibe oder Kristallsplitter. Es zieht Gegner
weiterhin nicht zur Mitte.

Sandböen und Wolken verwenden dieselbe räumliche Staubstruktur und Farbpalette.
Breite, weich auslaufende Böen gehen in die Wolken über. Körner, Wolken und Böen
folgen einer gemeinsamen, vom Abstand zur Mitte abhängigen Drehbewegung, damit
das Feld als zusammenhängende Sandmasse wirkt.

Beim Ausklingen verlieren die Sandböen ihre Höhe, die Staubwolken lockern sich,
und die Körner sinken zu Boden und verblassen. Gelände wird einmal beim
Platzieren abgetastet. Die Staubwolken teilen sich einen instanzierten
Zeichenaufruf und richten sich zur Kamera aus; ihre Reihenfolge berücksichtigt
die Kameratiefe. Insgesamt benötigt das Feld höchstens fünf zusätzliche
Zeichenaufrufe. Es verwendet feste Puffer, keine zusätzlichen Lichter, Texturen
oder Nachbearbeitung. Pause friert sämtliche Bewegung ein. Die Spielwerte,
Zielsteuerung und das Stabmodell bleiben erhalten.

- Original unverändert: `assets/inbox/Sanduhrenstab.glb`, SHA-256
  `7da82740306403088148b4f1458b888e11a3bd05dce8d249406678cf8c5e9fbd`.
- Abgeleitete Spielkopie: `assets/imported/tripo-hourglass-staff/runtime/hourglass-staff.glb`.
- 6.000 Dreiecke, 247.972 Bytes, eingebettete PBR-Texturen; Original etwa 1,93 Mio. Dreiecke.
- Wiederholbare Blender-Pipeline: `scripts/prepare-hourglass-staff.py`.
- Im Editor als **Sanduhrstab / kit-tripo-hourglass-staff**, mit Modellvorschau,
  Seltenheit, Aufheben und Waffenwechsel. Keine automatische Änderung der Karte.

## Prüfung

`tests/hourglass-spell.test.js` prüft Vorwarnung, Aufenthaltsdauer, Erholung,
Eis-Kombination, Mehrfachquellen, Wände, Wasser, Pause, Sichtbarkeit,
Geländeanpassung, tatsächliche Höhe und Kreisbewegung der Sandkörner, feste
Puffer, Freigabe der Ressourcen und die echte Waffensteuerung.
`tests/hourglass_staff_smoke.py` prüft den erzeugten Editor, gespeicherte
Platzierung, das importierte Modell, Maus/Touch, reale Übungsgegner und sämtliche
Animationsphasen in Chromium. GPU-Pixelproben prüfen sichtbaren warmen Sand
und den Verzicht auf eine dominante türkisblaue Fläche; sie ersetzen keine
visuelle Prüfung der Wirbelform. Eine Aufnahme aus der normalen Spielkamera
ergänzt die Detailbilder. Screenshots landen unter
`test-results/hourglass-staff/`. Touch-Emulation ersetzt keinen Test auf einem
physischen iPad. Der bestehende Veröffentlichungsworkflow führt diesen Test mit
Unit-, Asset- und Build-Prüfungen vor der Pages-Veröffentlichung aus.

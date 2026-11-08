# Innenholz, Rollspur, Seltenheitsleuchten und neue Stäbe

Das innere Holz der geöffneten Truhe verwendet dunklere warme Brauntöne. Die
Textur der Außenflächen bleibt Teil des ursprünglichen Tripo-Modells.

Die Schneerollspur ist jetzt 1,00 statt 0,76 m breit. Nach dem Absprung beginnt
sie verzögert und besteht aus unregelmäßigen Bodenkontakten mit runden Enden.
Die Druckstellen folgen auch auf Hängen der Oberfläche. Schuhabdrücke
bleiben dem Gehen vorbehalten. Pause und Neustart behandeln beide Spurenarten
wie bisher.

Abgelegte Waffen erhalten farbiges Bodenlicht, einen weichen Lichtsaum um das
Modell und schwebende Funken. Farbe, Intensität und Funkenzahl folgen der
aktuellen Seltenheit. Aufheben, Tauschen, neu ausgewürfelte Beute und Neustart
aktualisieren das Leuchten gemeinsam mit dem Gegenstand. Das Bodenlicht folgt
auch an Hängen der Geländeform. Es benötigt zwei Zeichenaufrufe je sichtbarer
Waffe, gemeinsam genutzte Funkengeometrie und ein kleines Bodengitter; es erzeugt
keine zusätzlichen Punktlichter. Sichtweite, Hindernisse und Nebel gelten weiterhin.

Der **Sternstab** steht als eigene Waffenart im Editor bereit. Platzierung,
Vorschaubild, JSON-Import/-Export, Spielen-Übergabe, Aufheben und Inventar nutzen
das hochgeladene Sternmodell. Sein gerades Sternprojektil verwendet dieselbe
Trefferprüfung wie die übrigen geradlinigen Stabgeschosse. Die verzierte
silberne **Mondsichel gehört zum Mondstab** und dreht sich beim Hin- und
Rückflug. Reichweite, Rückkehrsperre und Trefferregeln des Mondstabs bleiben
erhalten. Herkunft und Aufbereitung stehen in [star-moon-assets.md](star-moon-assets.md).

Der vorhandene Waldbaum erhält einen runderen Stamm, farblich abgestufte Rinde
und leicht gewölbte Blattflächen mit weicher Beleuchtung. Die ursprüngliche
Blattmaske bleibt pixelgleich. Der Export hat 15.788 Dreiecke, 557.124 Byte und
dieselbe Höhe. Bereits gespeicherte Bäume nutzen die neue Darstellung ohne
Änderung ihrer Position, Größe oder Kollision.

Die Originale in der Inbox und die gespeicherte Weltkarte bleiben erhalten.
`npm test` prüft die Spiel- und Editorregeln; `npm run verify:assets` prüft Originalhashes,
geschlossene Dateilisten und die tatsächlichen GLBs. Die Browserprüfung
`tests/polish_inbox_smoke.py` verwendet den erzeugten Editor und das erzeugte
Spiel mit einer temporären Testkarte. Sie prüft die neun betroffenen Abläufe
und erfasst Bilder, Build-ID und die ausgelieferten Datei-Hashes. Die Messung
erfolgt in Chromium/SwiftShader und ist kein Nachweis der Tablet-Leistung.

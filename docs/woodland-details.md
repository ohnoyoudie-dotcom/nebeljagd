# Wald, Wegbegrenzung und Bruchstücke

Fässer und Holzkisten zerbrechen beim tödlichen Treffer in Teile ihrer eigenen
Modelloberfläche. UVs, Holztexturen und Metallbänder bleiben erhalten. Die Teile
fallen und kippen auf die Geländeoberfläche, bleiben sechs Spielsekunden sichtbar
und verblassen bis Sekunde zehn. Pause hält die Bewegung und Lebensdauer an;
Neustart entfernt alle Reste. Die vorhandenen Regeln für Schaden und Kollision
bleiben erhalten. Maximal 112 Bruchstücke können gleichzeitig aktiv sein.

Die Trennung der Oberflächen ist eine kleine visuelle Physiksimulation, kein
vollständiger Starrkörperlöser. Es entstehen keine zusätzlichen Hindernisse.
Geometrien werden pro Ursprungsmodell wiederverwendet; nur die unabhängig
verblassenden Materialien gehören den einzelnen Resten.

Gemalte Steinwege erhalten eine Reihe kantiger, abgeflachter Randsteine auf der
gemeinsamen Außenkontur. Überlappende Pinselstriche erzeugen keine inneren Reihen;
späteres Übermalen mit Gras entfernt die darunterliegende Begrenzung. Gezeichnete
Hauptwege erhalten ebenfalls zwei Randreihen, Kreuzungen bleiben frei. Brücken
und schmale Trampelpfade behalten ihre bisherige Darstellung. Steine werden in
räumlichen Instanzgruppen gezeichnet und auf höchstens 6.000 begrenzt. Die Mitte
des Wegs bleibt Erde, ohne zufällig verteilte Steintextur.

Die Rollspur im Schnee variiert ihre Mitte, Breite und Druckstellen entlang der
zurückgelegten Strecke. Ungleiche Pulverschultern und kleine Schürfstellen brechen
die gerade Kontur auf. Der Verlauf bleibt über Bild- und Segmentgrenzen hinweg
zusammenhängend, auch auf Hängen. Rollen erzeugt weiterhin keine Schuhabdrücke.

`kit-user-tree1` verwendet eine separate Waldversion des bereits reparierten
Baumexports: kompaktere seitliche Äste, leicht asymmetrische Krone, abgestufte
olivgrüne Blattfarben und matte braune Rinde. Höhe (7,80 m), Stammkollision,
gespeicherte Platzierungen, Blattmasken und Wind bleiben erhalten. Originale
liegen unverändert in `Blender/` und `assets/imported/user-trees/runtime/`.
Die Ableitung einschließlich Prüfbild und Hashmanifest liegt in
`assets/imported/user-trees/styled/`. `scripts/style-user-tree.py` beschreibt die
reproduzierbare Vorbereitung und verweigert das Überschreiben vorhandener
Ausgaben. Die Blender-5.2-Quelldatei lässt sich im vorhandenen Blender 4.3 nicht
direkt öffnen; deshalb wird der geprüfte GLB-Export bearbeitet. Das Ergebnis hat
weiterhin 6.992 Dreiecke, eingebettete Texturen und keine Netzwerkdecoder.

Der Mondstab verwendet das inzwischen synchronisierte Inbox-Modell
`crescent moon prop 3d model.glb`: eine räumliche silberne Sichel mit
eingearbeiteten Mondmotiven und violettem Innenrand. Die unveränderte Quelle
hat 1.912.266 Dreiecke und 62,2 MB. Die separate Spielversion unter
`assets/imported/tripo-moon-projectile/` hat 6.000 Dreiecke, eingebettete
512-Pixel-PBR-Texturen und 496.172 Bytes. Sie ist 1,10 m lang, liegt mit der
verzierten Vorderseite nach oben und rotiert während Hin- und Rückflug. Die
vorhandenen Treffer-, Reichweiten-, Pausen- und Rückkehrregeln bleiben erhalten.
`scripts/prepare-moon-projectile.py` nutzt dieselbe geprüfte Vorbereitung wie
Eiskristall und Federpfeil und überschreibt keine vorhandenen Dateien.

Prüfung: `npm test`, `npm run verify:assets`, `npm run build`, anschließend
`tests/woodland_details_smoke.py`, `tests/snow_roll_smoke.py` und
`tests/moon_projectile_smoke.py` gegen die
generierten Browserdateien. Die Browserprüfungen verwenden nur temporäre
Spieltestkarten und speichern Bilder und Messwerte unter `test-results/`.
Chromium/SwiftShader prüft Darstellung und Verhalten, keine Tablet-Leistung.
Die autorisierte Veröffentlichung erfolgt über den bestehenden `work`-Workflow
mit Prüfung des exakten GitHub-Pages-Commits.

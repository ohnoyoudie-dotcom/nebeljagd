# Wald, Wegbegrenzung und Bruchstücke

Fässer und Holzkisten zerbrechen beim tödlichen Treffer in Teile ihrer eigenen
Modelloberfläche. UVs, Holztexturen und Metallbänder bleiben erhalten. Die Teile
fliegen nach außen und oben, wirbeln durch die Luft und prallen kurz vom Boden ab.
Erst danach legen sie sich flach auf die Geländeoberfläche. Der Impuls streut
zwischen den Teilen und skaliert gemäßigt mit der Objektgröße. Fässer verwenden
etwas geringere Fluggeschwindigkeiten, Höhen und Rotationen. Jeder Bruch erhält
eine neue Zufallsverteilung, auch nach einem Neustart; während Pause und Flug
werden die Bahnen nicht neu ausgewürfelt. Bei normaler Größe
landen die Reste einige Meter um das zerstörte Objekt herum. Sie bleiben sechs
Spielsekunden sichtbar und verblassen bis Sekunde zehn. Pause hält die Bewegung und Lebensdauer an;
Neustart entfernt alle Reste. Die vorhandenen Regeln für Schaden und Kollision
bleiben erhalten. Maximal 112 Bruchstücke können gleichzeitig aktiv sein.

Die Trennung der Oberflächen ist eine kleine visuelle Physiksimulation, kein
vollständiger Starrkörperlöser. Es entstehen keine zusätzlichen Hindernisse.
Geometrien werden pro Ursprungsmodell wiederverwendet; nur die unabhängig
verblassenden Materialien gehören den einzelnen Resten.

Gemalte Wege erhalten lockere Gruppen unterschiedlich großer Randsteine auf der
gemeinsamen Außenkontur. Freie Abschnitte, versetzte Lagen und verschiedene
Steinformen brechen die bisher durchgehende Reihe auf. Erd-, Wald-, Sand-,
Schnee-, Kies- und Schlammpfade verwenden zum Belag passende Farben und Größen.
Die Zufallsverteilung bleibt beim Neuladen stabil. Überlappende Pinselstriche
erzeugen keine inneren Reihen; späteres Übermalen mit Gras entfernt die
darunterliegende Begrenzung. Gezeichnete Hauptwege und Trampelpfade erhalten
entsprechende lockere Säume, Kreuzungen und Brücken bleiben frei. Steine werden
in räumlichen Instanzgruppen gezeichnet und auf höchstens 6.000 begrenzt.
Die Mitte des Naturwegs mit Randsteinen bleibt Erde.

Die Rollspur im Schnee beginnt nach dem Absprung und zeichnet unregelmäßige
Bodenkontakte mit weichen Lücken. Ungleiche Pulverschultern und kleine
Schürfstellen brechen die Kontur auf. Das Muster bleibt über Bild- und
Segmentgrenzen hinweg stabil, auch auf Hängen. Rollen erzeugt weiterhin keine
Schuhabdrücke. Die Lebensdauer vorhandener Spuren hängt von ihrem Alter ab;
neue Abdrücke verdrängen keine noch sichtbaren alten Spuren.

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
15.788 Dreiecke, eingebettete Texturen und keine Netzwerkdecoder. Die aktuelle
Verfeinerung rundet den Stamm, variiert seine Rindenfarbe und wölbt die
Blattflächen leicht; die ursprünglichen Blattmasken bleiben unverändert.

Der Mondstab verwendet das inzwischen synchronisierte Inbox-Modell
`crescent moon prop 3d model.glb`: eine räumliche silberne Sichel mit
eingearbeiteten Mondmotiven und violettem Innenrand. Die unveränderte Quelle
hat 1.912.266 Dreiecke und 62,2 MB. Die separate Spielversion unter
`assets/imported/tripo-star-moon/` hat 6.000 Dreiecke, eingebettete
512-Pixel-PBR-Texturen und 613.004 Bytes. Die vom Original gebackenen Normalen
erhalten die Gravuren. Sie ist 1,20 m lang, liegt mit der
verzierten Vorderseite nach oben und rotiert während Hin- und Rückflug. Die
vorhandenen Treffer-, Reichweiten-, Pausen- und Rückkehrregeln bleiben erhalten.
`scripts/prepare-tripo-star-moon.py` beschreibt diese Vorbereitung. Die frühere
Ableitung unter `tripo-moon-projectile` bleibt als geprüfte Vorstufe erhalten;
sie wird nicht zusätzlich ins Spiel eingebettet.

Prüfung: `npm test`, `npm run verify:assets`, `npm run build`, anschließend
`tests/woodland_details_smoke.py`, `tests/snow_roll_smoke.py` und
`tests/moon_projectile_smoke.py` gegen die
generierten Browserdateien. Die Browserprüfungen verwenden nur temporäre
Spieltestkarten und speichern Bilder und Messwerte unter `test-results/`.
Chromium/SwiftShader prüft Darstellung und Verhalten, keine Tablet-Leistung.
Die autorisierte Veröffentlichung erfolgt über den bestehenden `work`-Workflow
mit Prüfung des exakten GitHub-Pages-Commits.

# Proportionen und Giftzauber

Die Spielfigur bleibt 1,82 m groß. Die Präsentationsgrößen gelten sowohl für
bestehende Karten als auch für neue Platzierungen bei Objektgröße 1:

| Objekt | Größenfaktor | Neue Modellgröße, ungefähr |
| --- | --- | --- |
| Karren | 1,40 | 1,52 m hoch, 4,06 m mit Deichsel |
| Fass | 1,40 | 1,33 m hoch |
| Brunnen | 1,30 | 3,12 m bis zum Dach |
| Schwert | 0,80 | 1,00 m lang |
| Stäbe | 0,82 | 1,39 m lang |
| Verzierter Bogen | 0,88 | 1,19 m lang |

`src/map/tripo-prop-definitions.js` skaliert Modellnormalisierung, Grundfläche,
Kollisionskörper, Dachhöhe und Zerstörungsradius gemeinsam. Die Editor-Auswahl
verwendet dieselben Grundflächen. `src/weapons.js` verwendet den Größenfaktor
für Bodenmodelle und ausgerüstete Waffen. Griff, Stabspitze, Bogensehne und
Pfeilansatz bleiben an den gemessenen Punkten des Modells befestigt.

Eine im Editor eingestellte Objektgröße multipliziert weiterhin die neue
Standardgröße. Kartenkoordinaten, Originaldateien, vorbereitete GLBs, Kampfreichweite
und Schaden werden durch die Präsentationsänderung nicht umgeschrieben.

`src/poison-visuals.js` zeichnet einen gedrehten, spitz zulaufenden Venomstachel
mit einer Spur aus maximal 14 Wegpunkten. Beim Einschlag ersetzt ein einzelnes
Rauchvolumen die sieben sichtbaren Kugeln. Drei bewegte Rauschfrequenzen erzeugen
unregelmäßige Dichte; 16 feste Abtastschritte pro Pixel integrieren die Farbe und
Durchsichtigkeit. Die Wolke quillt auf und löst sich am Ende weich auf. Die
Zielmarkierung bleibt deutlich, die Markierung einer aktiven Wolke ist dezenter.

Es gibt keine zusätzlichen Texturen, dynamischen Lichter oder bildschirmweiten
Renderdurchgänge. Das Volumen prüft die Tiefe an seiner Vorderfläche, damit es
nicht an den Bodendreiecken abgeschnitten wird. Die Verdeckung innerhalb des
Volumens ist eine Näherung ohne separate Tiefentextur. Bestehende Sichtbarkeit,
3 Sekunden Dauer, 2,4 m Wirkungsradius und Schadensprüfung bleiben erhalten.
Pause friert die Effekte ein; Ablauf, Neustart und Entsorgung geben die
instanzeigenen Geometrien und Materialien frei.

Prüfungen: `npm test`, `npm run verify:assets`, `npm run build` sowie die echten
generierten Browserdateien mit `tests/proportions_poison_smoke.py` und
`tests/tripo_weapon_editor_smoke.py`. Der erste Test legt nur eine temporäre
Prüfkarte an und speichert Bilder/Berichte unter `test-results/proportions-poison`.
Die Browserprüfung erfolgt lokal mit Chromium/SwiftShader; sie ist keine
Messung auf einem physischen Tablet.

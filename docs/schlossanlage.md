# Schlossanlage

Die Variante `house:schlossanlage` ist eine leere, einstöckige Schlossanlage für
**Objekte → Haus → Schlossanlage** im Karteneditor. Sie ersetzt keine vorhandenen
Gebäude oder Kartenobjekte.

- Grundfläche: 70 × 60 Meter bei Größe 1.
- Offener Innenhof: 34 × 24 Meter; natürlicher Kartenboden bleibt sichtbar.
- Zwei große Säle, zehn Kammern, zwei Torhallen und vier verbundene Gänge.
- Ein südlicher Haupteingang, ein nördlicher Nebeneingang und vier Hofdurchgänge.
- Der umlaufende Korridor verbindet die Flügel auch ohne Querung des Innenhofs.
- Keine festen Möbel, Truhen, Fässer oder Dächer.

Die Anlage lässt sich drehen, skalieren, kopieren und mit unterschiedlichen
Stein-, Putz- und Holzfarben platzieren. Der zusammenhängende Grundriss bleibt
fest; die Raumanzahl- und Eingangsregler kleiner Häuser gelten dafür nicht.

`src/map/castle-definition.js` definiert Wände, offene Durchgänge, Räume,
Bodenflächen und Schwellen gemeinsam für Kollision, Darstellung und Editor.
`src/castle-model.js` erzeugt die Architektur. `house-builder.js` registriert die
Variante, sodass die vorhandenen Karten-, Gelände- und Speicherfunktionen greifen.

Der Innenhof fehlt bewusst in `footprintAreas` und `floorAreas`: kein unsichtbarer
Hausboden, kein Innenraumstatus und kein Ausschluss von Gras im Hof. Die
Hofdurchgänge sind als eigene Schwellen mit Höhenübergang eingetragen. Das Gelände
wird unter der Gesamtanlage eingeebnet. Durchgänge haben keine querliegenden
Balken über der Öffnung; Seitenwände bleiben Hindernisse für Figuren und Projektile.

Die neue Variante ist vom alten, aus der Objektauswahl entfernten
`kit-tripo-castle` unabhängig. Gespeicherte Karten und die fünf bisherigen
Hausbaukasten-Varianten behalten ihre Grundrisse.

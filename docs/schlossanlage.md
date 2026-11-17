# Schlossanlage

Die Variante `house:schlossanlage` ist eine leere, einstöckige Steinburg für
**Objekte → Haus → Schlossanlage** im Karteneditor. Sie ersetzt keine anderen
Gebäude oder Kartenobjekte. Bestehende Schloss-Platzierungen verwenden denselben
Variantenschlüssel und erhalten die überarbeitete Architektur.

- Grundfläche: **140 × 120 Meter** bei Größe 1 – viermal die bisherige Fläche.
- Zwei offene Innenhöfe, jeweils 34 × 54 Meter, mit ebener Steinpflasterung.
- Zwei große Säle, eine Mittelhalle, neunzehn Kammern, zwei Torhallen und sechs
  verbundene Gangabschnitte. Türen und Wandhöhen bleiben im menschlichen Maßstab.
- Ein südlicher Haupteingang, ein nördlicher Nebeneingang, acht Hofdurchgänge
  und 39 innere Durchgänge.
- Ein äußerer Rundgang und zwei über die Mittelhalle verbundene Hofrundgänge.
  Zusätzliche Türen verbinden die großen Säle und die seitlichen Zimmerfolgen.
- Ausschließlich Steinböden und Steinwände; keine Dielen, Holzverkleidung oder
  verputzten Wohnraumwände. 38 offene, vergitterte Fenster ohne Glas.
- 48 Fackelhalter in den Gängen, abseits der Durchgänge und Fenster.
- Keine festen Möbel, Truhen, Fässer oder Dächer.

Die Anlage lässt sich drehen, skalieren, kopieren und mit verschiedenen
Steinfarben platzieren. Der zusammenhängende Grundriss bleibt fest; die
Raumanzahl- und Eingangsregler kleiner Häuser gelten dafür nicht.

`src/map/castle-definition.js` definiert Wände, Durchgänge, Räume, Hofpflaster,
Schwellen, Fenster und Fackelpositionen gemeinsam für Darstellung und Editor.
`src/castle-model.js` erzeugt die Architektur. `house-builder.js` registriert die
Variante, sodass die vorhandenen Karten-, Gelände- und Speicherfunktionen greifen.

Die Innenhöfe fehlen bewusst in `footprintAreas` und `floorAreas`: kein erhöhter
Hausboden und kein Innenraumstatus. `courtyardPavingAreas` beschreibt ihre eigene
Pflasterung auf Geländehöhe. Die Hofdurchgänge sind Schwellen mit einem Übergang
zum 18 Zentimeter hohen Innenboden. Das Gelände wird unter der gesamten Anlage
eingeebnet. Durchgänge haben keine querliegenden Balken über der Öffnung.
Vergitterte Fenster sind sichtbar offen, bleiben für Bewegung und Projektile
aber durch die vorhandenen Wandkollider gesperrt.

Die neue Variante ist vom alten, aus der Objektauswahl entfernten
`kit-tripo-castle` unabhängig. Die fünf bisherigen Hausbaukasten-Varianten
behalten ihre Grundrisse und Materialien.

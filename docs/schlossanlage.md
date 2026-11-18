# Schlossanlage

Die Variante `house:schlossanlage` ist eine Steinburg mit leerem, begehbarem Erdgeschoss für
**Objekte → Haus → Schlossanlage** im Karteneditor. Sie ersetzt keine anderen
Gebäude oder Kartenobjekte. Bestehende Schloss-Platzierungen verwenden denselben
Variantenschlüssel und erhalten die überarbeitete Architektur.

- Grundfläche: **140 × 120 Meter** bei Größe 1 – viermal die bisherige Fläche.
- Zwei offene Innenhöfe, jeweils 34 × 54 Meter, mit grünen Rasenflächen von
  32 × 52 Metern und einem einen Meter breiten, ebenen Steinrand.
- Zwei große Säle, eine Mittelhalle, neunzehn Kammern, zwei Torhallen und sechs
  verbundene Gangabschnitte sowie vier begehbare Turmerdgeschosse.
- Vier große Ecktürme: quadratische Steinsockel tragen achteckige Obergeschosse
  und Zinnen. Gesamthöhe oberhalb des Bodens: 12,2 Meter. Die oberen Wehrterrassen
  sind Architektur und werden nicht über zusätzliche Etagen betreten.
- Die Außenmauern wirken von draußen 7,5 Meter hoch. Beim Betreten der Anlage,
  einschließlich der Höfe, gibt die obere Architektur die Sicht auf das weiterhin
  drei Meter hohe Erdgeschoss frei. Steingrößen und Durchgänge bleiben maßstäblich.
- Ein südlicher Haupteingang, ein nördlicher Nebeneingang, acht Hofdurchgänge
  und 43 innere Durchgänge. Der große südliche Torbogen ist 8,8 Meter hoch und
  lässt unter seinem Rundbogen reichlich freien Durchgang.
- Ein äußerer Rundgang und zwei über die Mittelhalle verbundene Hofrundgänge.
  Zusätzliche Türen verbinden die großen Säle und die seitlichen Zimmerfolgen.
- Ausschließlich Steinböden in den Innenräumen und Steinwände; keine Dielen, Holzverkleidung oder
  verputzten Wohnraumwände. 38 offene, vergitterte Fenster ohne Glas.
- 48 Fackelhalter in den Gängen, abseits der Durchgänge und Fenster.
- Keine festen Möbel, Truhen oder Fässer; die Einrichtung bleibt frei gestaltbar.

Die Anlage lässt sich drehen, skalieren, kopieren und mit verschiedenen
Steinfarben platzieren. Der zusammenhängende Grundriss bleibt fest; die
Raumanzahl- und Eingangsregler kleiner Häuser gelten dafür nicht.

`src/map/castle-definition.js` definiert Wände, Durchgänge, Räume, Hofrasen,
Randpflaster, Türme, Torbogen, Schwellen, Fenster und Fackelpositionen gemeinsam für Darstellung und Editor.
`src/castle-model.js` erzeugt die Architektur. `house-builder.js` registriert die
Variante, sodass die vorhandenen Karten-, Gelände- und Speicherfunktionen greifen.

Die Innenhöfe fehlen bewusst in `footprintAreas` und `floorAreas`: kein erhöhter
Hausboden und kein Innenraumstatus. `courtyardLawnAreas` beschreibt die beiden
grünen Flächen; `courtyardPavingAreas` enthält nur die acht überschneidungsfreien
Randstreifen auf Geländehöhe. Die Hofdurchgänge sind Schwellen mit einem Übergang
zum 18 Zentimeter hohen Innenboden. Das Gelände wird unter der gesamten Anlage
eingeebnet. Die ursprünglichen Raumdurchgänge bleiben offen; die vier zusätzlichen
Turmzugänge sind jeweils 3,6 Meter breit. Ein kleiner Vorbereich bewahrt auch die
bisherigen Zugänge in die Eckkammern.
Die Hofrasenflächen bleiben auch bei einer Platzierung im Schnee oder Sand grün;
die Darstellung passt das Gelände innerhalb der Anlage an, ohne die gespeicherte
Biomeinteilung der Karte umzuschreiben.
Vergitterte Fenster sind sichtbar offen, bleiben für Bewegung und Projektile
aber durch die vorhandenen Wandkollider gesperrt.

`architecturalWalls` beschreibt den niedrigen, sichtbaren Grundriss. `walls`
enthält davon unabhängige physische Höhen für die Außenmauern und zusätzliche
`projectileOnly`-Kollider für die hohen Turmseiten, Wehrterrassen und den gebogenen
Torsturz. Diese oberen Körper sperren keine Wege im Erdgeschoss und ändern sich
nicht mit dem Sichtausschnitt. Diagonale Turmwände bestehen für die Kollision aus
kurzen Scheiben statt aus einem großen Rechteck durch den gesamten Turm.
`cutawayBounds` umfasst die gesamte Anlage einschließlich beider grüner Höfe.

Die neue Variante ist vom alten, aus der Objektauswahl entfernten
`kit-tripo-castle` unabhängig. Die fünf bisherigen Hausbaukasten-Varianten
behalten ihre Grundrisse und Materialien.

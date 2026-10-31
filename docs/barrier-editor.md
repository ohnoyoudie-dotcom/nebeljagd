# Mauern und Zäune zeichnen

Im Karteneditor unter **Objekte → Mauern & Zäune ziehen**:

1. Eine der fünf Optiken wählen: **Steinmauer**, **Steinmauer · Pfeiler & Abdeckung**,
   **Steinmauer · Verwittert (Tripo)**, **Holzzaun** oder **Holzzaun · Kreuzstreben**.
2. **Gerade ziehen** oder **Freihand mit Ecken** einstellen.
3. **Strecke ziehen** aktivieren, auf der Insel ziehen und loslassen.
4. **Durchgang setzen** wählen und auf eine Strecke tippen. Die Breite ist
   einstellbar, voreingestellt sind 3 Meter.
5. Mit **Auswählen** die Strecke oder ihre hellen Formpunkte verschieben.
   **Punkt hinzufügen** fügt eine weitere Ecke ein. Rechts lassen sich Optik,
   Größe und Name ändern sowie einzelne Durchgänge wieder schließen.

**Strecken radieren** entfernt ganze berührte Mauer- und Zaunverläufe.
Ein Strich lässt sich mit **Rückgängig** zurückholen. **Esc** bricht einen
laufenden Zeichen- oder Radierstrich ab. Die gewöhnlichen einzelnen Objekte
und Beute werden von diesem Radierer nicht verändert.

Unter **3D-Vorschau** erscheint die zuletzt gezeichnete oder ausgewählte
Strecke mit den tatsächlichen Modellen. Ohne Auswahl wird ein Beispiel gezeigt.
**Spielen** öffnet die gesamte aktuelle Karte. **Speichern** sichert sie als
`worldmap.json`; auch eine exportierte Editor-HTML behält die Strecken.

## Modelle und Austausch

Die ursprünglichen Modelle `wall:kit-stone` und `fence:kit-wood` stammen aus
dem Nebeljagd-Umwelt-Kit. Zwei weitere Spielmodelle ergänzen die Auswahl:

- `wall:kit-cut-stone`: gesetzte Steinquader, Pfeiler und breite Abdecksteine.
- `fence:kit-cross-wood`: Holzpfosten mit diagonalen Kreuzstreben.

Die Varianten mit Pfeilern und Kreuzstreben entstehen direkt aus Spielgeometrie in `src/barrier-models.js`;
es werden dafür keine externen Grafiken benötigt. Beide sind auch als einzelne
Objekte verfügbar. Eine ausgewählte Strecke kann rechts unter **Optik dieser
Strecke** auf jede Variante umgestellt werden; mit **Übernehmen** bleiben ihre
Formpunkte, Durchgänge und Größe erhalten. Die 3D-Vorschau zeigt den Wechsel.
Auch JSON, SVG und eigenständige Editor-Dateien speichern die gewählte Variante.
Die bestehenden Strecken werden nicht automatisch umgestaltet.

**Steinmauer · Verwittert (Tripo)** verwendet deinen eigenen Export aus
`assets/inbox/stone wall 3d model.glb`. Die aufbereitete Spielversion liegt in
`assets/imported/tripo-wall/runtime/wall.glb`; Texturen und Natursteinoptik bleiben
erhalten. Sie kann einzeln oder als gezeichnete Strecke mit Durchgängen gesetzt
werden. Die unveränderte Eingangsdatei bleibt im Inbox-Ordner.

Zusätzliche GLBs können später als weitere Stile aufgenommen werden, ohne den
Verlauf neu zu zeichnen. Normalisierte Modellmaße und Anschlussflächen müssen
dann passend definiert werden.

Die Modelle werden wiederholt; Restlängen werden auf die Stücke einer geraden
Teilstrecke verteilt. Nur ihre Länge wird angepasst, nicht Höhe und Dicke.
Ecken entstehen durch aneinanderstoßende geradlinige Abschnitte. Eigene
Eckmodelle und bewegliche Tore sind noch nicht Teil dieses
Werkzeugs. Sicht, Bewegung und Geschosse verwenden die zum Modell gehörenden
Hindernisse; ein Durchgang erzeugt dort keine Mauerstücke.

## Weiterverwendbare Kartendaten

Die optionale Liste `barriers` speichert die Form unabhängig von den Modellen:

```json
{
  "id": "mauer-garten",
  "name": "Gartenmauer",
  "kind": "wall",
  "variant": "kit-stone",
  "points": [[0, 0], [24, 0], [24, 12]],
  "scale": 1,
  "gaps": [{ "at": 12, "width": 3 }]
}
```

`points` sind Meterkoordinaten auf den horizontalen Achsen x/z. `at` ist die
Entfernung der Durchgangsmitte vom Anfang entlang der gesamten Strecke;
`width` bleibt eine Breite in Weltmetern, auch bei einem Materialwechsel.
Beim Kürzen einer Strecke darf kein Durchgang außerhalb der Strecke liegen;
solche Änderungen werden mit einem Hinweis verworfen und sind korrigierbar.

`src/map/barriers.js` erzeugt die einzelnen Bauteile ausschließlich für die
Laufzeit. Sie werden nicht zusätzlich in `objects` gespeichert. Alte Karten
ohne `barriers` funktionieren unverändert. Die Validierung begrenzt Anzahl,
Punkte und Gesamtzahl der erzeugten Objekte; sie prüft auch Durchgänge und
Strecken, die zwischen zwei Landpunkten über das Meer führen würden.

## Prüfung

- Node-Tests für Geometrie, Normalisierung, Durchgänge, Kapazitätsgrenzen,
  SVG-Ausgabe, Freihandvereinfachung und Radieren.
- `tests/barrier_editor_smoke.py`: echte Maus-/Touch-Bedienung, Bearbeiten,
  Materialwechsel, Abbrechen, Rückgängig, JSON und eigenständige HTML-Datei.
- `tests/barrier_runtime_smoke.py`: tatsächliche GLBs mit Bewegungs-, Geschoss-
  und Sichtprüfung an geraden/gedrehten Mauern, Ecken und offenen Durchgängen.
- `tests/barrier_styles_smoke.py`: alle vier Modelle, Wechsel der Optik mit
  unveränderten Formpunkten und Durchgängen, Rückgängig sowie Speichern/Laden.
  `NEBELJAGD_EDITOR_URL` erlaubt dieselbe Prüfung an der fertig gebauten HTML.

Browserprüfungen nutzen Chromium mit Touch-Emulation. Die Bedienung und
Leistung auf einem physischen iPad sind damit noch nicht gemessen.

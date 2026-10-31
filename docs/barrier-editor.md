# Mauern und Zäune zeichnen

Im Karteneditor unter **Objekte → Mauern & Zäune ziehen**:

1. **Steinmauer** oder **Holzzaun** wählen.
2. **Gerade ziehen** oder **Freihand mit Ecken** einstellen.
3. **Strecke ziehen** aktivieren, auf der Insel ziehen und loslassen.
4. **Durchgang setzen** wählen und auf eine Strecke tippen. Die Breite ist
   einstellbar, voreingestellt sind 3 Meter.
5. Mit **Auswählen** die Strecke oder ihre hellen Formpunkte verschieben.
   **Punkt hinzufügen** fügt eine weitere Ecke ein. Rechts lassen sich Material,
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

Die erste Version verwendet die vorhandenen Modelle
`wall:kit-stone` und `fence:kit-wood` aus dem Nebeljagd-Umwelt-Kit. Die neueren
Tripo-Bildvorlagen sind noch keine eingebauten 3D-Modelle. Zusätzliche GLBs
können später als weitere Stile aufgenommen werden, ohne den Verlauf neu zu
zeichnen. Normalisierte Modellmaße und Anschlussflächen müssen dann passend
definiert werden.

Die Modelle werden wiederholt; Restlängen werden auf die Stücke einer geraden
Teilstrecke verteilt. Nur ihre Länge wird angepasst, nicht Höhe und Dicke.
Ecken entstehen durch aneinanderstoßende geradlinige Abschnitte. Eigene
Eckmodelle, bewegliche Tore und Pfostenvarianten sind noch nicht Teil dieses
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

Browserprüfungen nutzen Chromium mit Touch-Emulation. Die Bedienung und
Leistung auf einem physischen iPad sind damit noch nicht gemessen.

# Tripo-Gegenstände und neue Gebäudebasis

Die Ausgangskarte ist für die neue Gebäudereihe freigeräumt: 26 bisherige Häuser
und 30 zugehörige oder bereits verwaiste Vorratstruhen wurden entfernt. Die
3.949 übrigen Weltobjekte einschließlich 16 Truhen, Startwaffen, Vegetation,
Wege und Regionsdaten bleiben erhalten. **Wirtshaus · Tripo (neu)** bleibt im
Editor verfügbar, wird jedoch nicht automatisch neu auf der Insel verteilt.

## Im Editor verwenden

Den aktuellen Branch `work` lokal aktualisieren und `welt/map-editor.html`
öffnen. Unter **Objekte & Verteilung** stehen die folgenden Ergänzungen bereit:

| Objektart | Modell | Gespeicherte Kennung |
| --- | --- | --- |
| Holzwagen | Holzwagen · Tripo | `wagon:kit-tripo-wagon` |
| Holzfass | Holzfass · Tripo | `barrel:kit-tripo-barrel` |
| Brunnen | Steinbrunnen · Tripo | `well:kit-tripo-well` |
| Felsen | Flacher Felsen · Tripo | `rock:kit-tripo-01` |
| Felsen | Findling · Tripo | `rock:kit-tripo-02` |
| Felsen | Hohe Felsgruppe · Tripo | `rock:kit-tripo-03` |
| Holztruhe | Schatztruhe · Tripo | `chest:kit-tripo-chest` |

**Auf Karte setzen** aktiviert das Platzieren. Position, Drehung und Größe
lassen sich anschließend in den Eigenschaften ändern; Duplizieren und der
Radiergummi funktionieren wie bei den bisherigen Objekten. **In 3D testen**
übergibt den aktuellen Entwurf an das Spiel. Für die Einzeldateien müssen
`map-editor.html` und `nebeljagd.html` im selben Ordner liegen.

Wagen, Brunnen und Felsen sind feste Hindernisse. Beim Brunnen blockiert der
Steinsockel die Bewegung; das Dach hält hohe Geschosse auf. Das Holzfass hat
60 Lebenspunkte und kann zerstört werden. Die Tripo-Truhe besitzt einen festen
Sockel für Bewegung, einen eigenen Klappdeckel und die bestehende Interaktion
mit **E**. Sie wirft Gold und eine Waffe aus. Ihr Sockel ist bewusst kein
Sichtblocker und kein Geschosshindernis, damit sie ihre eigene Interaktion nicht
verdeckt. Ein Rundenneustart stellt Fass und Truhe wieder her.

Der Editor fügt die neuen Modelle nicht ungefragt auf der gesamten Karte hinzu.
Auch das ausdrückliche Neu-Erzeugen mit `scripts/seed-world-objects.js` erzeugt
keine der ausgemusterten Häuser oder deren Vorratstruhen mehr. Dieses Skript
ersetzt die Objektsammlung nur nach bewusstem Aufruf mit `--replace` und wurde
für diese Änderung nicht auf der Projektkarte ausgeführt.

## Alte Entwürfe erhalten und gezielt bereinigen

Ein gespeicherter Browserentwurf wird weiterhin über **Wiederherstellen**
geladen. Enthält er alte Häuser, erscheint der Hinweis **Alte Gebäude
entfernen**. Dasselbe gilt für importierte JSON-Dateien. Die Bereinigung
entfernt ausschließlich `herbal`, `inn`, `hunter`, `kit-timber`, `kit-taverne`
und ihre eindeutig zugeordneten Vorratstruhen. Das neue Tripo-Wirtshaus,
andere Gegenstände und individuelle Geländeänderungen bleiben erhalten.

Die Aktion ist ein einzelner Schritt in der Historie: **Zurück** stellt die
entfernten Einträge wieder her. Die ursprüngliche JSON-Datei wird dabei nicht
automatisch überschrieben; den bereinigten Stand mit **worldmap.json speichern**
sichern. Alte Hausvarianten bleiben für vorhandene Dateien lesbar, werden beim
neuen Platzieren jedoch nicht mehr angeboten.

## Quellen und Aufbereitung

Die hochgeladenen GLBs bleiben unverändert unter `assets/inbox/`. Für Wagen,
Fass, Brunnen und Felsen liegen aufbereitete Modelle und Herkunftsnachweise in
`assets/imported/tripo-props/`; die animierbare Truhe verwendet das eigene Paket
`assets/imported/tripo-chest/`. Das bestehende Wirtshaus bleibt separat unter
`assets/imported/tripo-tavern/` dokumentiert.

Die Pakete enthalten Prüfsummen und die tatsächlich ausgeführten lokalen
Blender-Schritte. Eingebettete Texturen und Modellteile werden erhalten oder
gezielt für den Browser reduziert; die Rohdateien werden nicht überschrieben.
Die sechs Landschaftsmodelle benötigen zusammen rund 3,71 MB und 51.991
Dreiecke statt rund 376 MB und 11,56 Millionen Dreiecken. Ihre 18 Texturen
sind mit jeweils 1024 × 1024 Pixeln eingebettet. Mehrere Platzierungen teilen
Geometrie und Materialien. Ein Vorher-nachher-Vergleich aus echten Blender-
Renderings liegt in `assets/imported/tripo-props/previews/comparison.png`.
Es wurde kein bezahlter Tripo-Auftrag ausgelöst. Die Nutzervorlagen werden
als separat gelieferte Projektmodelle geführt, nicht unter der Lizenz des
älteren Umwelt-Kits. Ein kommerzieller Anbieterbeleg wird dadurch nicht erzeugt.

## Prüfstand

`npm test`: **182 Prüfungen bestanden**. Dazu gehören Gebäudebereinigung,
erhaltene Entwürfe, Schema/JSON-Rundlauf, Original-Prüfsummen, Modellbudgets,
Kollisionen, getrennte Deckel und Beuteverhalten. `npm run verify:assets`
prüft außerdem die geschlossenen Dateilisten aller drei Tripo-Pakete.
`npm run build` erzeugt die aktualisierten Browserdateien.

`tests/tripo_props_smoke.py`: **10 Spielprüfungen bestanden**, einschließlich
echter Editorbedienung, Entwurfsbereinigung mit Rückgängig/Wiederherstellen,
aller sieben Vorschauen, Platzieren/Drehen/Skalieren, Export/Import, Übernahme
ins Spiel, Bewegung/Rolle gegen Hindernisse, Öffnen der Truhe, Zerstören des
Fasses, Pfeiltreffer am hohen Felsen und Wiederherstellung beim Rundenneustart.
Bericht: `docs/tripo-props-gameplay-check.json`.

Die tatsächlich ausgelieferten Dateien aus `welt/` wurden zusätzlich über
einen lokalen HTTP-Server geprüft: **6 Prüfungen bestanden**, ohne JavaScript-
Fehler oder externe Ressourcenabrufe. Diese Ausgabe enthält die geprüften
Editor- und Spiel-Hashes in `docs/tripo-props-check.json`. Die Prüfung erfolgte
in Chromium mit Software-WebGL; direkte `file://`-Aufrufe und die Leistung
auf einem echten iPad sind damit nicht gemessen.

Aktuelle Ansichten: `docs/tripo-props-standalone-editor.png`,
`docs/tripo-props-standalone-wagon-well-barrel.png` und
`docs/tripo-props-standalone-chest-open.png`.

Die Browserdateien werden auf `work` unter `welt/` bereitgestellt. Ein Push auf
`work` aktualisiert die bestehende öffentliche Veröffentlichung auf `main` nicht.

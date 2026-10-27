# Landschaft gestalten im vorhandenen Karteneditor

Die Werkzeuge erweitern den bestehenden Editor und dieselbe `worldmap.json`,
aus der das Spiel seine Insel erzeugt. Die bisherigen 4.020 Objektplatzierungen,
Küsten, Wege, Gebäude und Spielregeln bleiben erhalten. Auf dem vorhandenen
Entwicklungsbranch `work` wird gearbeitet; diese Erweiterung wird nicht auf
`main` und damit nicht auf die öffentlichen Spielseiten übertragen.

## Architektur und vorhandene Assets

Der bisherige Editor bearbeitet SVG-Kartenelemente und speichert ein geprüftes
JSON-Dokument. Undo/Redo, lokale Entwürfe, JSON-Import/-Export und „In 3D testen“
werden weiterverwendet. Landschaftswerkzeuge erzeugen gewöhnliche gespeicherte
Objekte und Bodenflächen; beim späteren Laden werden keine zufälligen Bäume
hinzuerfunden. `schemaVersion: 1` bleibt importierbar. Die optionale Erweiterung
`landscape.version: 1` und `object.vegetation` enthalten die neuen Einstellungen.

Das Spiel verwendet Three.js/WebGL2. Gras und wiederholte Modelle bleiben
instanziert; ein gemeinsames Shaderfeld bewegt die Vegetation. Die vorhandenen
Rei-Laubbäume, Sträucher und Blumen werden wiederverwendet. Die hochgeladene
`grassGN3_3_v2_Rei.glb` enthält keine verwendbaren Grashalme; die sieben Graslooks
verwenden deshalb vorhandene prozedurale Halmgeometrie, Höhen und Farben.
Zusätzlich bleibt das echte GLB-Versteckgras aus dem bereits vorhandenen
Nebeljagd-Umwelt-Kit auswählbar. Die Blumenwiese ergänzt vorhandene Rei-Blüten. Es wurden keine neuen Provider-Assets
angefordert und keine Blender-Shader als Laufzeitvoraussetzung eingeführt.

Die zwölf Modelle unter `Blender/nebeljagd_umwelt_kit_v1/assets/` sind ebenfalls
im gemeinsamen Editor-/Spielkatalog verfügbar: vier Bäume, zwei Felsen, Gras,
Mauer, Zaun, Ruinenbogen, Fachwerkhaus und Holzkiste. Mauer, Zaun und Kisten
blockieren Bewegung und Sicht. Kisten zerbrechen nach mehreren Treffern; danach
entfallen auch Kollision, Pfeilblockade und Sichtschatten. Ein Rundenneustart
stellt sie wieder her. Kisten sind Landschaftsobjekte, keine Beutetruhen. Der
Bogen behält eine begehbare Öffnung; das Haus bleibt ohne Dach und durch seinen
Eingang begehbar. Drehung und Skalierung gelten für Darstellung und Kollision
gemeinsam. Die Quellmodelle bleiben unverändert.

## Bedienung

Die linke Werkzeugleiste enthält sechs Bereiche: **Gelände**, **Vegetation**,
**Objekte**, **Wind und Umgebung**, **Biome** sowie **Karte und Vorschau**.
Maus oder Finger ziehen einen Pinselstrich; ein Strich ist ein Rückgängig-Schritt.
Esc verwirft einen laufenden Strich. Leertaste verschiebt die Ansicht. Die
bisherige Einzelobjektbearbeitung mit Auswahl, Drehung, Größe und Duplizieren
bleibt verfügbar.

### Vegetation

Sieben Typen stehen zur Wahl: kurzes Wiesengras, mittelhohe Wiese, hohes
Versteckgras, trockenes Gras, Waldgras, Sumpfgras und Blumenwiese. Die Höhe reicht
von 25 bis 300 Prozent des gewählten Typs; zusätzliche Höhenvariation reicht
von 0 bis 50 Prozent. Der Höhenfaktor verändert die Halmhöhe, nicht die
Bodenfläche. Wurzeln bleiben auf dem Gelände. Dichte und Pinselstärke reichen
von 0 bis 100 Prozent. Kleine Radien ermöglichen einzelne Büschel, größere
Radien zusammenhängende Flächen. Weiche, unregelmäßige Ränder reduzieren harte
elliptische Grenzen.

„Bodenfarbe übernehmen“ mischt die tatsächliche Bodenfarbe mit der gewählten
Grasfarbe. Der Mischregler verändert keine Texturtransparenz. Ein begrenzter
Grünanteil verhindert, dass beispielsweise Sand das Gras vollständig umfärbt.
Manuelle Farbe, Helligkeit, Sättigung und Variation pro Büschel bleiben
unabhängig einstellbar. Nach einer Bodenänderung aktualisiert die Vorschau die
Anpassung; beim nächsten „In 3D testen“ verwendet das Spiel dieselben Werte.

Bereits platzierte Grasflächen auswählen und rechts unter **Vegetation dieser
Fläche** bearbeiten, anschließend **Änderungen übernehmen**. Der Radiergummi
entfernt ganze Objekte beziehungsweise mit **Nur Grasflächen** gezielt Gras.
Die Löschwirkung richtet sich weiterhin nach dem berührten Objektmittelpunkt.
Einzelne Halme innerhalb einer Fläche werden nicht separat bearbeitet.

### Boden und natürliche Verteilung

Der Bodenpinsel malt Wiese, Waldboden, Erde, Sand, Schlamm, Stein, Fels, Schnee
oder Pflaster. Radius, Stärke, Randhärte, Farbe und Variation sind einstellbar.
Die Flächen bleiben in der Kartenliste auswählbar, verschiebbar und nachträglich
änderbar. **Bodenfarbe radieren** entfernt ganze gemalte Flächen; die darunter
liegende ursprüngliche Region wird wieder sichtbar. Bodenmalen ändert keine
Geländehöhen, Wege- oder Wasserkollisionen.

**Objekte verteilen** streut ausgewählte vorhandene Baum-, Strauch-, Gras-,
Fels- und Blumenmodelle. Dichte, Gruppenbildung, Drehung, Größenbereich und
Mindestabstand sind einstellbar. Küste, Wasser, Wege, bestehende Gebäude und
Hindernisse werden berücksichtigt. Große neue Hindernisse halten zusätzlich
Startbereiche und erreichbare Beute frei. Jedes Ergebnis bleibt ein normal
verschiebbares Objekt. Die ursprünglichen Objekte werden dabei nicht ersetzt.

### Wind, Zonen und Vorschau

Wind lässt sich einschalten und mit Stärke, Geschwindigkeit, Richtung,
Turbulenz und Böen einstellen. Den Richtungspfeil ziehen oder den Winkelregler
verwenden; null Grad bedeutet Norden. Änderungen werden mit der Karte
übernommen. Lokale kreisförmige Windzonen erlauben andere Stärken und Richtungen.
Stärke null erzeugt Windschutz. Ein weicher Übergangsbereich mischt das lokale
Feld mit dem umgebenden Wind. Die Zonen lassen sich auswählen, verschieben,
ändern und löschen.

Die **Lebendige Vorschau** zeigt eine kleine tatsächlich gerenderte Grasfläche
mit demselben Vegetationsmodell und Windshader wie das Spiel. Sie ist keine
vorgefertigte Animation. Die Vorschau stoppt außerhalb des sichtbaren Bereichs
und bei verborgenem Browser-Tab. Änderungen werden zusammengefasst, damit nicht
für jede Sliderbewegung eine komplette Szene aufgebaut wird.

### Biome und gespeicherte Einstellungen

Acht Vorlagen stehen bereit: Wiese, Wald, Herbstwald, Sumpf, Wüste,
Schneegebiet, Felslandschaft sowie Dorf und Bauernhof. Ein Biompinsel kombiniert
passenden Boden und gewöhnliche editierbare Vegetationsobjekte. Er ersetzt
keine vorhandenen Regionen oder Häuser. **Biom als Werkzeugeinstellung**
übernimmt die Vorlage zum weiteren manuellen Bearbeiten.

Eigene Einstellungen lassen sich unter einem Namen in der Karte speichern,
laden, entfernen und als Biompinsel verwenden. Enthalten sind Vegetation,
Boden, Verteilung, Wind und Pinselradius. „Dorf und Bauernhof“ gestaltet Boden
und Begleitvegetation; Häuser werden weiterhin im Objektwerkzeug platziert.
„Herbstwald“ verwendet die vorhandene Herbsteiche aus dem Umwelt-Kit zusammen
mit wärmeren Boden- und Grastönen.

## Speicherung und Leistungsgrenzen

JSON-Export, lokale Entwurfswiederherstellung und „In 3D testen“ übertragen alle
neuen Werte einschließlich Windzonen, Böden, Biomen und benannten Vorlagen.
Eine SVG bleibt eine zusätzliche editierbare Darstellung mit Landschaftsebenen;
Änderungen im Grafikprogramm werden nicht automatisch zurück nach JSON gelesen.
Ältere Karten ohne Landschaftserweiterung behalten ihre ursprüngliche
Vegetationsdichte, Halmhöhen und gespeicherten Objekte.

Die Landschaftsdatei begrenzt Bodenflächen auf 4.096, Windzonen auf 32, Biommarken
auf 1.024 und eigene Vorlagen auf 32. Die allgemeine Grenze von 12.000
Weltobjekten bleibt bestehen. Ein Pinselstrich erzeugt höchstens 256 Objekte;
sehr lange Striche können deshalb einen Hinweis auf die Strichgrenze zeigen.
Gras bleibt in kleinen Abschnitten organisiert, mit geringerer Detailstufe und
begrenzter Zeichendistanz. Das gemeinsame Budget umfasst 500.000 Einheiten:
ein prozedurales Grasbüschel kostet eine Einheit, ein aufwendigeres
GLB-Grasbüschel zehn. Prozedurale Flächen sind auf 1.800 Büschel begrenzt;
GLB-Gras auf 80 Büschel pro Fläche und 12.000 insgesamt. Bei sehr großen
Flächen bedeutet 100 Prozent deshalb die maximal verfügbare Dichte innerhalb
dieses Budgets. Gespeicherte Einstellungen bleiben dabei erhalten.

Gemalter Boden wird in Texturen für betroffene Geländeabschnitte gebacken,
nicht als ein eigenes Mesh pro Pinselabdruck gezeichnet. Texturgröße und
Speicherbudget unterscheiden sich zwischen niedriger und hoher Qualität.
Die Shaderanimation ändert pro Frame den gemeinsamen Zeitwert statt sämtliche
Instanzmatrizen auf der CPU zu aktualisieren.

## Prüfung und Grenzen

- `tests/landscape_editor_smoke.py` prüft die vollständige alte Karte, die
  tatsächlichen Maus- und Touchwerkzeuge, Auswahlbearbeitung, Radierer,
  Undo/Redo, Abbruch, Verteilung, Biome, Windpfeil/Zonen, Vorlagen,
  WebGL-Vorschau einschließlich Pause außerhalb der Ansicht, JSON, Neuladen,
  eigenständiges Editor-HTML ohne Netzwerk sowie die genaue Übergabe an das Spiel.
- `tests/landscape_game_smoke.py` lädt Landschaftsdaten über die normale
  Kartenimportfunktion und prüft niedrige/hohe Qualität, Höhen, Dichten,
  Null-Dichte, Bodenfarbanpassung, manuelle Farbe und Renderbudgets.
- `tests/vegetation_render_smoke.py` vergleicht echte gerenderte Pixel bei
  laufendem und ausgeschaltetem Wind für alle sieben Vegetationstypen.
- `tests/environment_kit_smoke.py` prüft Import und Modellvorschauen aller zwölf
  vorhandenen Kit-Varianten, die genaue Editor-/Spielübergabe sowie echte Lauf-,
  Roll- und Pfeilkollisionen an gedrehten/vergrößerten Mauern, Zäunen und Kisten.
  Bogenöffnung, Hauszugang und GLB-Versteckgras werden im Spiel geprüft.
- Die neuen CPU-Tests prüfen Datenvalidierung, alte Karten, Platzierungsregeln,
  Bodenmischung sowie Wind-, Höhen-, Farb- und Dichteberechnung.

Die zugehörigen Berichte liegen in `landscape-editor-check.json`,
`landscape-game-check.json`, `vegetation-render-check.json` und
`environment-kit-check.json`. Die Tests laufen
in Chromium mit Software-WebGL und emulierten Touch-Ereignissen. Sie belegen
Funktion, Rendering und begrenzte Ressourcen; eine stabile Bildrate auf echten
Schul-iPads oder ein Safari-Gerätetest ist damit noch nicht nachgewiesen.
Multiplayer und die bereits vorgemerkten zusätzlichen Spielsysteme sind nicht
Bestandteil dieser Erweiterung.

`tests/landscape_preview_smoke.py` prüft zusätzlich einen schnellen Wechsel
von Gras zu einem noch ladenden GLB und zurück. Der alte Fehler wird gezielt
reproduziert; die korrigierte Vorschau endet bei der zuletzt gewählten
Einstellung. Bericht: `landscape-preview-check.json`.

Die eigenständigen HTML-Dateien werden mit ihren unveränderten Bytes in einem
Offline-Browserkontext geprüft. Die wiederhergestellte Cloud-Umgebung sperrt
direkte `file://`-Navigation; deshalb wird die Hauptdatei aus dem Speicher
bereitgestellt und jede weitere Netzwerkanfrage kontrolliert. Diese Prüfung
belegt die eingebetteten Ressourcen, nicht die Dateiverwaltung auf einem
physischen iPad.

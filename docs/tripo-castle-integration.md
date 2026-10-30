# Kleines Schloss im Editor und Spiel

Die bereits im Repository vorhandene Datei **assets/inbox/castle interior 3d model.glb**
ist als **Haus → Kleines Schloss · Tripo** eingebunden. Es ist das kleinere
Schloss mit einem großen Saal und vier Seitenräumen, nicht der spätere
30-Raum-Entwurf des Gartenschlosses.

## Benutzen

1. Aktuellen Editor öffnen und **Objekte** wählen.
2. Objektart **Haus**, Variante **Kleines Schloss · Tripo** auswählen.
3. Auf der Karte platzieren; Position, Drehung und Größe lassen sich bearbeiten.
4. **In 3D testen** öffnet den eigenen Entwurf im Spiel.

Das Schloss wird nicht automatisch in die gespeicherte Ausgangskarte gesetzt.
Die vom Nutzer bearbeitete worldmap.json bleibt bytegenau erhalten.
In dieser Entwicklungsversion liegen die aktualisierten Quellen und erzeugten
HTML-Dateien auf Branch **work**. Die in älteren Dokumenten genannten öffentlichen
GitHub-Pages-Links verwenden weiterhin den Veröffentlichungsstand von main.

## Modell und Spielverhalten

- Laufzeitmodell: **assets/imported/tripo-castle/runtime/castle.glb**
- Variante: **house:kit-tripo-castle**
- Einheitliche Originalproportionen: ca. **70 × 48,6 m**, ohne Dach.
- **179.999 Dreiecke**, etwa **14 MB** statt ca. 68 MB / 1.916.390 Dreiecken.
- Basisfarbe bleibt 4K, Normal-/Metall-Rauheitstexturen jeweils 2K.
- Zwei tatsächlich offene Außenzugänge: **Hauptportal im Süden und Westtor**.
  Die rechte Außenwand des gelieferten Modells ist geschlossen.
- Gemessene Proxy-Kollisionen für Außenwände, Trennwände und große Möbel.
  Öffnungen passen für den vollständigen Spielerradius; niedrige Möbel lassen
  entsprechend hohe Geschosse passieren.
- Bodenauflage und Torbereiche folgen Position, Drehung und Größe des Gebäudes.
  Eine im Export abgesenkte Eingangsfläche wurde in der abgeleiteten GLB
  begrenzt korrigiert. Das Original bleibt unverändert.
- Gras wird unter dem vollständigen Gebäude unterdrückt. Karten-/Minikarten-
  Darstellung und Auswahlbereich berücksichtigen die tatsächliche Größe.
- Feste 15-m-Grenzen für Kollisionen und Übungsgegner-Platzierung wurden durch
  Gebäudegrenzen ersetzt; große Gebäude bleiben beim Annähern sichtbar.

Die Einrichtung gehört zum gemeinsamen Mesh. Einzelne Schlossmöbel sind deshalb
in dieser Integration nicht separat zerstörbar. Die Kollisionsformen sind
bewusst einfach; sie sind keine vollständige physikalische Dreiecksoberfläche.

## Prüfung

- **207 Node-Tests bestanden.**
- **npm run verify:assets**: Quellen unverändert, eingebettete GLB-Abhängigkeiten
  und geschlossener Dateikatalog einschließlich Schloss geprüft.
- **npm run build**: eigenständige Spiel-/Editor-Dateien und ZIP erzeugt.
- Der reproduzierbare Browserablauf steht in **tests/tripo_castle_smoke.py**;
  sein Ergebnis und Screenshots in **docs/tripo-castle-check.json** bzw.
  **docs/tripo-castle-*.png**. Er prüft echte Editorbedienung, JSON-Roundtrip,
  GLB-Rendering, Betreten beider Tore und Seitenräume, Wände/Möbel und eine
  gedrehte, skalierte Kopie.

Vier ältere Testdateien hatten ihre Fixtures aus der veränderbaren Nutzerkarte
gelesen und scheiterten bereits im ursprünglichen HEAD an deren leerer
Objektliste. Sie verwenden jetzt eine dokumentierte historische Testkarte in
tests/fixtures/. Die ursprünglichen Prüfungen für Seed- und Beuteobjekte bleiben
erhalten; leere Nutzerkarten bleiben ausdrücklich leer.

Blender-Aufbereitung, Begrenzung der Bodenreparatur, Original-/Laufzeit-Hashes
und Materialnachweise stehen in **assets/imported/tripo-castle/**.
Browserprüfungen mit Chromium/SwiftShader ersetzen keinen Leistungstest auf
echten iPads und keine Prüfung eines späteren Mehrspielerbetriebs.

# Neues Tripo-Wirtshaus im Editor

Die vom Nutzer hochgeladene Datei
`assets/inbox/medieval tavern interior 3d model.glb` ist als zusätzliche
Hausvariante **Wirtshaus · Tripo (neu)** eingebunden. Die ältere Taverne und
das bisherige Waldgasthaus bleiben verfügbar. Die Ausgangskarte wird durch
die Registrierung nicht um zusätzliche Gebäude verändert.

## Ausprobieren

1. Den aktuellen Branch `work` lokal aktualisieren und `welt/map-editor.html`
   öffnen. `welt/nebeljagd.html` muss im gleichen Ordner bleiben.
2. **Objekte & Verteilung** öffnen, Objektart **Haus** wählen und als Modell
   **Wirtshaus · Tripo (neu)** auswählen.
3. **Auf Karte setzen** wählen und eine freie Fläche anklicken. Alternativ
   **＋ In die Mitte** verwenden. Größe 1 entspricht ungefähr 22 × 17,77 m.
4. Position, Drehung und Größe lassen sich in den Eigenschaften ändern.
5. Mit **In 3D testen** die aktuelle Karte im Spiel öffnen. Die Eingänge liegen
   vorn und hinten; die Küche hat zwei Zugänge. Änderungen als JSON speichern.

Die Variante heißt im Kartendokument `house:kit-tripo-tavern`. Sie wird beim
Speichern und erneuten Import beibehalten. Eine gerenderte Modellvorschau und
ein zur Grundfläche passendes SVG-Symbol sind im Editor enthalten.

## Modell und Laufzeit

- Unverändertes Original: 65.440.900 Bytes, 1.860.045 Dreiecke.
- Aufbereitete GLB: 7.053.948 Bytes, 100.000 Dreiecke, drei eingebettete
  2048 × 2048 Texturen. Keine externen Textur- oder Decoder-Dateien nötig.
- Separate Ladebehandlung erhält UVs und PBR-Materialien; die ältere
  Fachwerkhaus-Aufbereitung wird nicht auf dieses Modell angewandt.
- Wände, Tische/Bänke, Theke und größere Küchenmöbel erhalten feste,
  anhand des Modells vermessene Kollisionskörper. Türen bleiben offen.
- Das Dach ist bereits im Original entfernt. Die Einrichtung ist Teil eines
  zusammenhängenden Modells und derzeit nicht einzeln verschiebbar oder
  zerstörbar. Die Außenwand bleibt sichtbar, auch wenn die Figur hineingeht.
- Die rekonstruierte Bodenfläche ist leicht uneben. Eine kleine Höhenzugabe
  und ein ebenes Gelände unter dem vollständigen, gedrehten Grundriss halten
  Erde und Gras aus dem Gastraum. Gelände wird nur nahe diesen Gebäuden feiner
  unterteilt; gemeinsame Dreieckskanten werden geschlossen verbunden, damit
  am Übergang keine Spalten entstehen. Die Prüfung der Fußbodenhöhe verwendet
  die tatsächliche Größe.

Die Quell- und Aufbereitungsschritte dokumentieren
`assets/imported/tripo-tavern/provenance.json` und `runtime-manifest.json`.
Das Original wurde nicht verändert. Die Vorbereitung lässt sich mit
`scripts/prepare-tripo-tavern.py` nachvollziehen.

## Prüfungen

- `npm test` inklusive Original-Prüfsumme, GLB-Budget, Tür-/Möbelkollisionen,
  Schema-Import und Geländeauflage bei verschiedenen Drehungen.
- `npm run verify:assets` und `npm run build`.
- `tests/tripo_tavern_smoke.py`: tatsächliche Editor-Bedienung, Vorschau,
  JSON-Export/Import, Übernahme ins Spiel, Bewegung, Rolle, feste Möbel und
  eine gedrehte/vergrößerte Kopie. Ergebnis: `docs/tripo-tavern-check.json`.

Browserprüfungen laufen in Chromium mit Software-WebGL; sie sind kein
Leistungsnachweis für ein echtes iPad. Die erzeugten HTML-Dateien werden auf
`work` unter `welt/` bereitgestellt. Der bestehende öffentliche Pages-Link
wird durch einen Push auf `work` allein nicht aktualisiert.

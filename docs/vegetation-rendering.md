# Vegetation und gemeinsamer Wind

`src/vegetation-patches.js` erzeugt reproduzierbare Instanzdaten aus den
gespeicherten Grasflächen. Ohne `object.vegetation` bleiben Samen, Standorte,
Höhen und Dichte des bisherigen Grases exakt erhalten. Die sieben neuen
Einstellungen verwenden die beiden bestehenden Halmgeometrien. Blumenwiesen
enthalten zusätzlich weiße, rote und goldene Blüten aus der vorhandenen
Rei-Blumen-GLB; neue Modell-Downloads sind nicht nötig.

Die Höhensteuerung verändert nur die Y-Skalierung der Halme. Fußpunkte liegen
weiter auf der tatsächlichen Bodenhöhe. Unterschiedliche Büschel erhalten
reproduzierbar unterschiedliche Höhen und Farben; bei Höhenvariation 0 sind
sie gleich hoch. Die Dichte bestimmt die Anzahl, einschließlich wirklich null
Instanzen bei 0 %. Ein gemeinsamer Detailrahmen begrenzt die Insel auf 500.000
Budgeteinheiten: ein prozedurales Büschel kostet eine Einheit, ein aufwendigeres
GLB-Büschel zehn. Prozedurale Flächen sind auf 1.800 Instanzen begrenzt,
GLB-Flächen auf 80; insgesamt höchstens 12.000 GLB-Büschel. `totalInstances`
zählt echte Instanzen, `budgetUnitsUsed` die gewichteten Kosten. Größere Wünsche
bleiben in der Karte gespeichert; `budgetLimitedPatches` und
`requestedInstances` machen eine reduzierte Darstellung prüfbar.

Bodenfarbanpassung verwendet dieselbe `spatial.colorAt`-Abfrage wie der bemalte
Boden. Änderungen an Regionen oder Bodenflächen werden beim nächsten
Spielstart bzw. sofort in der Editorvorschau berücksichtigt. Selbst bei 100 %
Farbanpassung kommen höchstens 70 % der Farbe aus dem Boden, ergänzt durch
einen kleinen Grünanteil. Manuelle Farbe, Helligkeit, Sättigung und Variation
wirken ausschließlich auf RGB; Materialtransparenz und Alpha-Masken bleiben
unverändert. Bei Blumenwiesen betrifft diese Grasfarbe die Halme, während die
Blüten ihre vorhandenen Modellfarben behalten.

`src/vegetation-wind.js` berechnet Richtung, räumliche Wellen, Böen und
Turbulenz im Vertexshader. Nur ein Zeitwert wird pro Bild aktualisiert; die
Instanzmatrizen werden nicht pro Halm neu geschrieben. Bis zu 32 Windzonen
überschreiben die globale Richtung/Stärke mit weichen Rändern. Stärke 0 in
einer Zone erzeugt Windschutz. Der globale Aus-Schalter schaltet auch lokale
Zonen aus. Geschwindigkeit 0 friert das Windfeld ein. Richtung 0 zeigt nach
Norden (−z), π/2 nach Osten (+x).

Die quadratische Gewichtung nach Halmhöhe hält Wurzeln fest und bewegt Spitzen
stärker. Die Weltrichtung wird in die gedrehten und skalierten Instanzen
zurücktransformiert. Benachbarte Büschel sehen dadurch dasselbe zusammenhängende
Feld. Baumkronen, vorhandene importierte Blätter, Sträucher und Blumen reagieren
schwächer; Baumstämme und Kollisionskörper bleiben unverändert. Die bisherige
Kronenausblendung nahe dem Spieler bleibt erhalten.

Gras behält 16-Meter-Teilgruppen, kürzere Sichtweiten in der Leistungsstufe und
die einfachere Geometrie in der Entfernung. Unsichtbare Gruppen benötigen
keine Vertexanimation. Die Editorvorschau benutzt denselben Erzeuger mit
`previewOnly: true`: normale Grasvorschauen laden keine GLBs und erzeugen keine
ungenutzten Häuser oder Bäume. Beim Ändern werden auch unbenutzte Geometrien,
Materialien und Texturen freigegeben. Blumenwiesen laden allein das vorhandene
Blumenmodell. Ausgewähltes `kit-tall` verwendet das vorhandene GLB-Gras aus
dem Umwelt-Kit, auch in der Vorschau. Die sieben Pinseltypen benötigen keine
zusätzlichen Grasmodelle. Das Kit-Modell behält ohne Farbkonfiguration seine
eigenen Farben; eine konfigurierte Fläche verwendet dieselben Höhen-, Dichte-,
Wind- und Farbregler wie prozedurales Gras. Die entfernte Kit-Darstellung
entfernt doppelte Rückseiten bei beidseitigem Material und bewahrt die Silhouette.

## Prüfungen

- `tests/vegetation_wind.test.js`: Höhen-/Dichteunabhängigkeit, deterministische
  Typen, weiche Ränder, Budget, Bodenfarbe, Wurzelanker, lokale Windrichtung und
  Windschutz, Off-/Geschwindigkeit-0 sowie Alpha-Erhalt.
- `tests/hiding_grass.test.js`: ursprüngliche dichte Halmgeometrie und LOD.
- `tests/vegetation_render_smoke.py`: echtes WebGL mit allen sieben Typen;
  Bildänderung bei Wind, identische Bilder bei deaktiviertem Wind, keine
  JavaScript-/Shaderfehler. Nach sieben Aufbau-/Abbauzyklen bleibt allein die
  Prüf-Bodenfläche als GPU-Geometrie erhalten.
- Messbericht: `docs/vegetation-render-check.json`.

Die Browserprüfung verwendet Chromium mit Software-WebGL. Sie belegt korrekte
Shader und Ressourcenfreigabe, aber keine Bildrate auf einem physischen iPad.

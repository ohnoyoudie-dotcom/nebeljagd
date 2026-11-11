# Blitzstab

Im Editor unter **Objekte → Einzeln → Blitzstab · Tripo** platzieren.
Die Vorschau zeigt das tatsächlich verwendete Modell aus
`assets/inbox/fantasy thunder staff 3d model.glb`. Das Original bleibt erhalten.
Die getrennte Laufzeitkopie hat 6.000 Dreiecke, eingebettete PBR-Texturen bis
256 Pixel und einen gemessenen Griffursprung mit Stabspitze.

**F**, linke Maustaste oder die Angriffstaste feuert einen einzelnen Blitz ab.
Er fliegt gerade vom Stabkopf mit 32 m/s, maximal 24 m weit. Der Grundschaden
beträgt 23, die Abklingzeit 0,9 s. Seltenheit skaliert den Schaden wie bei den
anderen Waffen. Der erste Gegner oder ein blockierendes Hindernis beendet
den Flug. Es gibt keinen Kettenblitz und keinen zusätzlichen Flächenschaden.

Ein warmweißer Kern, blaue Verzweigungen und eine kurze Lichtspur bilden das
Projektil. Beim Treffer springen kurze radiale Lichtbögen und Funken nach außen;
der elektrische Impuls dauert 0,38 s. Zwei gekreuzte Flächen machen den Blitz
aus der Top-Down-Perspektive sichtbar. Effekte verwenden feste Puffer und den
vorhandenen Partikelpool, Sichtprüfung und Pause. Zusätzliche Lichtquellen und
Bildschirm-Nachbearbeitung sind nicht erforderlich.

Prüfung: `npm test`, `npm run verify:assets`, `npm run build` und
`NEBELJAGD_URL=http://127.0.0.1:4176 python tests/lightning_staff_smoke.py`.
Der Browsertest prüft Editorplatzierung, echtes Stabmodell, Maus/Touch,
Projektil, Einzeltreffer, Pause und Neustart am erzeugten Spiel.

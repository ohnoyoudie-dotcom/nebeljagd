# Magischer Einstieg

Im lokalen Spiel startet der Spieler als blau-violetter Komet über der gesamten Insel. Die vorhandene Avatar-Datei bleibt unverändert und wird während des Flugs ausgeblendet.

- „Absprung starten“ beginnt sofort einen zehnsekündigen Sinkflug. WASD/Pfeiltasten oder der Touch-Stick steuern den Kometen; die Weltkarte dient nur zur Orientierung. Es gibt keine zusätzliche Zielauswahl oder Bestätigung.
- Die Fernansicht verwendet die tatsächlichen Gelände-, Brücken- und Objektgeometrien mit den vorhandenen Materialien. Die alte niedrig aufgelöste Insel-Textur entfällt. Statische Geländeabschnitte werden für wenige Zeichenaufrufe zusammengefasst; Objektgeometrien werden geteilt. Die Originalmodelle bleiben unverändert.
- Der Flug bleibt während des Sinkens steuerbar. Die Geschwindigkeit nimmt in Bodennähe für eine präzise Landung ab.
- Wasser, Kartenränder und Hindernisse werden mit der vorhandenen Weltkollision geprüft. Über einer ungültigen Stelle hält der Komet über dem Boden; erst über freiem Land wird die Landung abgeschlossen.
- Die Perspektivkamera nähert sich fließend der normalen Spielansicht. Erst nach der Landung beginnen Kampf und Spielzeit.
- Beim Aufsetzen erscheint der Originalavatar in einem kurzen Lichtimpuls. Staub, Funken und Krater bleiben am Aufprallpunkt und verschwinden vollständig. Pause und Neustart werden berücksichtigt.

Die Effekte verwenden kleine prozedurale Texturen und begrenzte Partikelpools, mit reduzierten Partikeln bei `prefers-reduced-motion`. Es werden keine neuen Modell-Downloads benötigt. Die Übungswiese behält ihren direkten Einstieg; dies ergänzt keine gemeinsame Multiplayer-Simulation.

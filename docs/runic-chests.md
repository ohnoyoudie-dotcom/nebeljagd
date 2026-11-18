# Runensiegel für Schatztruhen

Die Einstellung `chestOpening: "rune"` aktiviert die seltene Truhenmechanik unabhängig vom Modell. Im Editor steht sie bei neuen und ausgewählten Truhen unter **Truhenöffnung → Runensiegel · seltene Beute**. Die Modellvariante **Seltene Truhe** (`kit-tripo-rare-chest`) verwendet das Runensiegel standardmäßig. Sie basiert auf `assets/inbox/Seltene Truhe.glb`, aufbereitet mit separatem Deckel, rückseitigem Scharnier und dunklem Innenraum. Bestehende normale Truhen behalten die sofortige Öffnung; die authored Karte wird nicht verändert.

- Aufenthalt im sichtbaren, erreichbaren Runenkreis lädt das Siegel auf. Bei Standardgröße beträgt der Radius 2,8 Meter. Der Fortschritt wächst anfangs um 8 Prozentpunkte pro Sekunde und beschleunigt innerhalb von drei Sekunden auf 20 Prozentpunkte; eine ununterbrochene Öffnung dauert ungefähr 5,9 Sekunden.
- Verlassen setzt die Beschleunigung zurück. Der Fortschritt bleibt 1,25 Sekunden erhalten und fällt danach um 9 Prozentpunkte pro Sekunde. Eine kleine Randtoleranz vermeidet Flackern beim Überqueren des Kreises.
- Wände, fehlende Sicht und ein Höhenunterschied von mehr als 1,2 Metern verhindern das Aufladen. Bei überlappenden Kreisen lädt nur die nächste erreichbare Truhe. Pausieren friert Fortschritt und Animation ein.
- Acht Runensegmente zeigen den Fortschritt. Eine umlaufende Lichtspur beschleunigt; beim Lösen wechseln die Runen kurz zu warmem Gold. Lichtimpuls und Partikel begleiten die verzögerte Deckelbewegung. Beute erscheint erst während der Öffnung und nur einmal.
- Beute wird einmal pro Runde gewürfelt: 65 % selten, 30 % episch, 5 % legendär. Gold wird gegenüber derselben Beutestufe verdoppelt. Der Seelenrichterstab bleibt wie bei normalen Truhen von zufälliger Beute ausgeschlossen.
- PC und Touch laden durch Aufenthalt auf. Der vorhandene Hinweis zeigt den Fortschritt; es ist kein zusätzliches Fenster und keine gehaltene Taste nötig.

Die Mechanik läuft im bestehenden lokalen Spiel. Sie implementiert keine serverautoritativen Mehrspieler- oder umkämpften Kontrollzonenregeln.

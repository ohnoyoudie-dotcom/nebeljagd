# Einhändiges Zaubern und Projektilstart

Beim Zaubern mit Feuer- oder Eisstab bleibt der freie linke Arm in der
vorhandenen Stand- beziehungsweise Laufanimation. Nur der Stabarm verwendet
die Zauberpose. Seine Bewegung, Stabneigung und der Handflächengriff bleiben
erhalten. Beim Wechsel zu Bogen oder Schwert werden deren Handvorgaben wieder
vollständig gesetzt; Rollen und Rücksetzen räumen die Zauberpose auf.

Das Projektil entsteht einschließlich seiner Höhe direkt an der sichtbaren
Kristallspitze. Bisher wurde es sofort auf die feste Flughöhe versetzt, was aus
der Seitenansicht als deutlicher Abstand sichtbar war. Jetzt geht es während
der ersten 0,14 Sekunden stetig auf die bisherige Zielflughöhe über. Dabei
bleiben die horizontale Geschwindigkeit, Effekte, Schadenswerte und die spätere
Flughöhe erhalten. Der neue gekrümmte Abschnitt wird in kleinen Schritten auf
Hindernisse geprüft; auch die Prüfung vom Körper zur Spitze bleibt aktiv.
Ein Abschuss bewegt sich im ersten Update nur um die tatsächlich nach seiner
Freigabe vergangene Zeit.

Build: `0e8227126343`. Umsetzung: `src/weapons.js`; erzeugte Ausgabe in `welt/`.

Prüfungen:

- Alle 358 Node-Tests bestanden. Neue Pose-Tests prüfen beide Stäbe, Wechsel zu
  Bogen/Schwert und Abbruch. Neue Projektiltests prüfen transformierte Spitzen,
  den exakten Startzeitpunkt, kontinuierlichen Flug, dünne Hindernisse bei
  großen Zeitschritten und wiederverwendete Projektilplätze.
- Zehn Nahaufnahmen vor/nach der Änderung mit den echten GLBs geprüft: freie
  Hand bleibt unten, Abschuss an der Spitze; keine Browserfehler.
- Der begrenzte Editor-Browsertest ist mit
  `python3 tests/staff_cast_smoke.py` wiederholbar. Er prüft beide echten Stäbe
  aus gegenüberliegenden Seitenansichten über Laden, Abschuss und Rückbewegung.
  Lokale Berichte und Aufnahmen: `test-results/staff-cast/`.
- Ausgangskarte unverändert, SHA-256
  `da923febdf6cf273533bcbca4490c27da8be942fae50f7660fccc653417a5a8b`.

Aktueller Link und Veröffentlichungsnachweis:
[Browser-Auslieferung](browser-delivery.md).

Der abschließende Browserlauf bestand alle sechs Prüfungen mit acht visuell
geprüften Spielaufnahmen und 36 Laufzeitbildern. Der gemessene Startversatz
zur Stabspitze sowie der Griffversatz zur Handfläche waren jeweils 0.
Keine Browser-, Shader-, WebGL- oder HTTP-Fehler.
Quellstand: `5857a3c1fe451bc9257f0126470e4a82fa9d907a`.

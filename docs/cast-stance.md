# Gegenhaltung, Fußstellung und gerader Zauberflug

Die freie Hand wird beim Zaubern weich in eine angewinkelte Position seitlich
an den Rippen geführt. Sie bleibt deutlich hinter der Stabhand. Der Stabarm
behält seine vorhandene Bewegung. Im Stand werden die Füße etwas breiter und
gegeneinander versetzt; eine kleine Hüftabsenkung erhält die bisherige Sohlenhöhe.
Hand- und Fußhaltung blenden nach dem Zaubern wieder aus. Beim Anlaufen wird
die Standkorrektur freigegeben, damit die vorhandene Laufanimation weiterläuft.
Rollen, Waffenwechsel und Rücksetzen lösen alle betroffenen Knochen wieder.

Projektile entstehen an der tatsächlichen Kristallspitze und fliegen ab dort
während ihrer gesamten Lebenszeit geradeaus auf unveränderter Starthöhe.
Die vorherige Angleichung an eine niedrigere Flugfläche ist entfernt.
Die horizontale Geschwindigkeit, der genaue Freigabezeitpunkt, die Effekte und
die kontinuierliche Kollisionsprüfung bleiben erhalten. Treffer verwenden die
tatsächliche Flughöhe: niedrige Ziele können unter dem Schuss liegen; ihre
Trefferflächen werden dafür nicht künstlich vergrößert.

Build: `89423bdc7ca0`; verwendbare Ausgabe in `welt/`.
`src/character-combat-pose.js` enthält die reversible Haltung über der bestehenden
Animation; `src/character.js` bindet das echte Rig ein. `src/weapons.js` steuert
Pose und Flugbahn. Die Originalmodelle sind unverändert.

Prüfungen:

- Alle 372 Node-Tests bestanden. Echte Rig-Tests prüfen Knöchel-/Zehenhöhen,
  Fußrotation, Armübergang, Laufanimation und vollständiges Wiederherstellen.
  Projektiltests prüfen beide Stäbe in vier Richtungen über die gesamte Flugzeit,
  große Zeitschritte, tatsächliche Hindernishöhen und wiederverwendete Projektile.
- Zehn Nahaufnahmen vor/nach der Änderung geprüft, einschließlich Stand und
  Laufen mit den echten GLBs; keine Browserfehler.
- Browserprüfung: `python3 tests/staff_cast_smoke.py`; lokale Berichte und Bilder
  unter `test-results/cast-stance/`.
- Nutzerkarte unverändert, SHA-256
  `da923febdf6cf273533bcbca4490c27da8be942fae50f7660fccc653417a5a8b`.

Aktueller Link und Veröffentlichung: [Browser-Auslieferung](browser-delivery.md).

Der abschließende Browserlauf bestand acht Prüfgruppen mit zehn visuell
geprüften Spielaufnahmen. Die Aufnahmen bestätigen die Gegenhaltung, den
breiteren/versetzten Stand, freie Laufbeine und den geraden Flug beider Stäbe.
Keine Browser-, Shader-, WebGL- oder HTTP-Fehler. Die Ausgangskarte wurde
zusätzlich beim Zurückkehren in den tatsächlichen Editor unverändert bestätigt.

Quellstand: `1bf711863fa52036dbcef6cfaea7d860107c0aa7`.
Der neuere Projektstand mit goldenen Levelabzeichen und Aufstiegseffekten ist
mit enthalten; die zwischenzeitlich hochgeladene Bogen-Originaldatei bleibt
unverändert in der Inbox erhalten.

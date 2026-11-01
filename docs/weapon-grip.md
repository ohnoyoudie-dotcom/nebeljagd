# Griffposition der Stäbe

Der Handknochen des hochgeladenen Avatars sitzt am Handgelenk. Die Modelle
waren dort befestigt, wodurch der Griff seitlich an der sichtbaren Hand vorbeilief.
Ein eigener Griffpunkt liegt nun bei 68 Prozent der Strecke vom Handgelenk zur
Wurzel des Mittelfingers, etwa 8,5 cm weiter in der Handfläche. Er wird im lokalen
Koordinatensystem der Hand gespeichert und folgt dadurch Laufanimation und Arm-IK.
Feuer- und Eisstab verwenden denselben anatomischen Griffpunkt. Ihre Modelle,
Größe und die bestehenden Zauberbewegungen bleiben erhalten.

`src/hand-grip.js` berechnet den Griffpunkt; `src/character.js` stellt ihn bereit.
`src/weapons.js` setzt die Stäbe daran und berechnet Abschuss und Effekte weiter
von der tatsächlichen Stabspitze. `?inspect` erlaubt für reproduzierbare
Nahaufnahmen eine Kamera-Vergrößerung bis 4×. Im normalen Spiel bleibt die Kamera
unverändert.

Prüfungen:

- Alle 351 Node-Tests bestanden. Drei neue Tests verwenden das echte Avatar-Rig
  und prüfen Laufanimation, Skalierung, Drehung, Rücksetzen und fehlende Knochen.
  Ein zusätzlicher Waffentest prüft beide echten Stabmodelle einschließlich
  Abschuss an der verschobenen Spitze.
- Nahaufnahmen vor/nach der Änderung sowie Seiten- und Zauberansichten geprüft:
  sichtbarer Handkontakt, kein zusätzlicher Positionsversatz erforderlich.
- Build `70f667e08ed9` liegt in `welt/`; der Editor öffnet das dazugehörige Spiel.
- Die Ausgangskarte hat unverändert SHA-256
  `da923febdf6cf273533bcbca4490c27da8be942fae50f7660fccc653417a5a8b`.

Die ausführliche Browserprüfung ist mit `python3 tests/weapon_grip_smoke.py`
wiederholbar. Sie verwendet den tatsächlichen Editor und **Spielen**, beide
Stäbe, vier Blickrichtungen, Laufen und den vollständigen Zauberablauf.
Berichte und Aufnahmen liegen lokal unter `test-results/weapon-grip/`.

Der abschließende Browserlauf bestand alle acht Prüfungen mit 14 Spielaufnahmen.
Während beider Lauf- und Zaubersequenzen betrug die gemessene Abweichung zwischen
Stabgriff und Handflächenpunkt null. Keine Browser-, Shader-, WebGL- oder
HTTP-Fehler. Die Eis-Nahansichten im Stand zeigen zusätzlich den beim normalen
Waffenwechsel korrekt abgelegten Feuerstab am Boden; Laufansicht und separate
Modell-Nahaufnahme bestätigen den Handkontakt ohne diese Überlagerung.

Quellstand auf `work`: `cac1b929232ef28d41bb6cb076336e258475b9cd`.
Die Veröffentlichung wird in [Browser-Auslieferung](browser-delivery.md) dokumentiert.

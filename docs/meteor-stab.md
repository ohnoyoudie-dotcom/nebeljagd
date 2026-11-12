# Meteorstab – erster spielbarer Prototyp

Im Editor unter **Objekte → Meteorstab** platzieren. Im Spiel aufnehmen,
Angriff gedrückt halten, Ziel wählen und loslassen. Nach drei Sekunden ist
die volle Reichweite von 20 Metern verfügbar. Maus/Tastatur und Touch
verwenden dieselbe Zielsteuerung wie die anderen Flächenstäbe.

Der Meteor wächst von 0,45 auf 4,2 Meter Durchmesser. Er fliegt in einem
hohen Bogen (acht Meter zusätzliche Höhe) und hinterlässt heiße Rauchwolken
und Funken. Beim Einschlag folgen eine kurze Druckwelle, Rauch und sechs
brennende Splitter. Die Einschlagsfläche hat denselben Radius wie die
Giftwolke: 4,8 Meter.

Vorläufige Spielwerte: 24 Basisschaden für die Explosion, höchstens ein
zusätzlicher Splittertreffer pro Gegner mit 12,5 Prozent des Explosionsschadens,
dazu drei Sekunden Brand mit zwei Schaden pro Sekunde. Die Seltenheit skaliert
den direkten Schaden. Der eigene Meteor verletzt den Werfer nicht. Hohe
Hindernisse blockieren den tatsächlichen Flugkörper und die Explosion;
niedrige Hindernisse kann der Flug tatsächlich überqueren. Pause hält
Flug, Splitter und Effekte an. Neustart entfernt alle Effekte.

## Modelldateien

`assets/inbox/Meteorstab.glb` bleibt unverändert (SHA-256
`50a20636486c57281120a165b05abe52533c09dee1f078f4d53970313bd8f5df`).
Die abgeleitete Browserkopie liegt in `assets/imported/tripo-meteor-staff/`:
6.000 Dreiecke, 242.244 Byte, eingebettete Texturen und gemessener Griffpunkt.
Inspektion, Vorschaubild und geschlossene Hash-Liste liegen im selben Paket.
Reproduktion: `blender -b -t 3 --python scripts/prepare-meteor-staff.py`, dann
`python scripts/register-meteor-preview.py` (Vorbereitung überschreibt keine
bestehenden Pakete).

**Das separate hochgeladene Meteorkörper-Modell fehlt im geprüften Inbox-Stand.**
`Meteorstab.rar` enthält ebenfalls nur `Meteorstab.glb`. Deshalb verwendet
die erste Animation ausdrücklich einen prozeduralen glühenden Felskörper;
dieser ist keine importierte Tripo-Datei. Der Renderer nimmt bereits einen
separaten Projektil-Prototyp an, sobald die entsprechende Datei vorliegt.

Die bestehende `worldmap.json` wird nicht um Testobjekte ergänzt. Der
Browsertest setzt den Stab ausschließlich in einen isolierten Entwurf und
eine eigene Übungswiesen-Testkarte.

## Prüfung

- `npm test`: Flug, Wachstum, Kollision, begrenzte Treffer und Brand,
  Pause/Neustart, Ressourcenbesitz, Editor-Symbol und Karten-Roundtrip.
- `npm run verify:assets` und `npm run build`.
- `NEBELJAGD_URL=http://127.0.0.1:4176 python tests/meteor_staff_smoke.py`:
  tatsächlich erzeugter Editor und Spiel, importierter Stab, Maus/Touch,
  Flugphasen, Einschlag, Schaden und vollständiger Effektabbau.

Rauch und Funken verwenden feste Pools mit jeweils 96 Einträgen. Es gibt
keine zusätzlichen dynamischen Lichter oder Nachbearbeitungspässe.

# Schattenstab und Uhrwerkstab

Beide Waffen verwenden die vom Nutzer gelieferten Tripo-GLBs aus `assets/inbox`. Die Originale werden nicht verändert; die Ableitungen stehen in eigenen `assets/imported/tripo-…-staff`-Verzeichnissen. Das bleibt der vorhandene projektlokale Importweg, keine externe Asset-Zertifizierung.

| Waffe | Gewöhnlicher Schaden | Verhalten | Abklingzeit |
| --- | --- | --- | --- |
| Schattenstab | 8 pro Gegner und Feld | 4 m Feldradius, 3 s Lebensdauer; 2,5 m Sicht im Feld und noch 2 s danach | 5,5 s |
| Uhrwerkstab | 5 pro Geschoss | 8 s aktiver Wächter nach 0,4 s Entfaltung, 25 Leben, 6 m Schussweite, 1 s Schussintervall, gerade Geschosse mit 14 m/s | 8 s |

Beide Zielkreise wachsen mit der üblichen Ladereichweite bis 20 m. Maus/F bzw. der rechte Touch-Zielstick wählen unabhängig von der Laufrichtung; Loslassen wirft das Geschoss. Der Schattenkreis hat den Feldradius, der Kapselkreis markiert den Platzbedarf des Wächters. Seltenheit skaliert den tatsächlichen Schaden. Individuelle Abklingzeiten bleiben beim Waffenwechsel erhalten.

`staff-lob.js` teilt nur die Bodenwahl und den in kleinen Schritten auf Kollision geprüften Bogenflug. Feld, Status, Wächter und Effekte besitzen eigene Controller. Eine ungültige Landestelle wird vor dem Wurf und beim Auftreffen erneut geprüft. Hindernisse können einen Wurf abfangen.

`darkened-status.js` hält Verdunkelung getrennt von der Sonnenblendung; die engere aktive Sichtgrenze gilt in der geometrischen Sichtprüfung und im Gelände-Shader. Die Schattenfläche merkt sich getroffene IDs. Im Feld wird die Verdunkelung ohne neue Trefferereignisse aufgefrischt. Nach Verlassen oder Feldende läuft sie noch 2 s. Erneutes Betreten erneuert den Status, aber keinen Schaden. Der Status beeinflusst weder Bewegung noch Angriff und deckt keine Figuren auf. Augensymbol, schwacher Radiusring und Körperpartikel beachten normale Sicht und Versteckgras.

Der Uhrwerkwächter ist ein temporäres, zerstörbares Kampfziel ohne Fortschrittsbelohnung. Er wählt lebende gegnerische Figuren nach Entfernung, Deckung und Versteckstatus. Ein Schuss behält seine Flugrichtung; auch später auftauchende Deckung und Projektilschilde fangen ihn ab. Der Wächter ist ortsfest und bleibt beim Waffenwechsel aktiv. Besitzer-Tod, Ablauf, Zerstörung und Neustart räumen Ziele/Effekte kontrolliert auf. Die Team-ID-Prüfung nutzt den vorhandenen Combat-Vertrag; sie führt keinen Netzwerk-Mehrspielermodus ein.

## Aufbereitung und Nachprüfung

- `scripts/prepare-shadow-staff.py`, `scripts/prepare-clockwork-staff.py`: Blender-Aufbereitung, gemessener Griff, 1,7 m Modelllänge, höchstens 5.000 Dreiecke und eingebettete Texturen; verweigern das Überschreiben vorhandener Ableitungen.
- `scripts/register-control-staff-previews.py`: WebP-Vorschaubilder aus echten Laufzeitmodell-Renderings; aktualisiert nur die zwei Katalogeinträge.
- `npm run verify:assets`: Original-Prüfsummen, vollständige Dateilisten und Ableitungs-Prüfsummen.
- `npm test`: Kampflogik, Sichtbegrenzung, Versteckregeln, Deckung, ausweichbare Geschosse, Zerstörung, Seltenheit, Waffenwechsel, Cooldowns, Reset und Asset-Verträge.
- `python tests/control_staffs_smoke.py`: tatsächliche generierte Editor-/Spiel-Dateien; Platzierung und erneutes Laden, Maus und Touch, beide Effekte, Verdunkelung samt Bewegung/Erholung, Wächter-Treffer und -Zerstörung, Pause und Neustart. Berichte und Bilder liegen unter dem ignorierten `test-results/control-staffs/`.

Browserprüfungen laufen mit Chromium und Software-WebGL. Sie ersetzen keine Leistungsmessung auf einem echten iPad. Autorisierte Veröffentlichung erfolgt nach erfolgreichem Build und Browserprüfung über `work` → `main/preview` → GitHub Pages; dabei bleiben die Benutzerkarte und das Hauptportal erhalten.

## Gewählte dunkle Effekte

- Schattenstab: Finsterniskomet mit dichtem Rauchkern statt harter Kugel. 28 erhöhte Nebelschichten, weiche Bodenkontakte und zeitversetztes Auflösen über 0,95 Sekunden. Die Wirkzeit bleibt bei 3 Sekunden, die Verdunkelung bei 2 Sekunden nach Verlassen.
- Seelenrichterstab: Geisternebel mit angedeuteten Augen und Mund im Rauch, bewegten Konturen und auslaufendem Schweif. Trefferhülle, drei Schädelteile und Hinrichtung bleiben erhalten.
- Uhrwerkstab: unverändert 8 Sekunden Wächterdauer und 14 m/s Geschossgeschwindigkeit.

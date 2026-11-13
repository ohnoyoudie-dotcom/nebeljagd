# Sonnenstab und Seelenrichterstab

Die drei Originalmodelle sind seit `900dec1` in `assets/inbox` vorhanden und
bleiben unverändert. Die getrennten Laufzeitpakete verwenden die Originalfarben,
PBR-Texturen, normalisierte Griffpunkte und die gemessene Projektilachse.

| Modell | Laufzeitgröße | Dreiecke |
| --- | ---: | ---: |
| Sonnenstab | 232.908 Bytes | 4.996 |
| Seelenrichterstab | 211.980 Bytes | 5.000 |
| Seelenflamme | 226.468 Bytes | 4.000 |

Aufbereitung: `scripts/prepare-sun-staff.py`, `prepare-soul-staff.py` und
`prepare-soul-projectile.py`, mit lokalem Blender. Inspektionen und Hashlisten
liegen in den jeweiligen `assets/imported/tripo-*`-Paketen. Die optionale
`game-dev`-CLI ist hier nicht installiert; dies sind die vorhandenen lokalen
Projektpakete, keine als kanonisch zertifizierten Anbieterpakete.

## Bedienung und vorläufige Spielwerte

- **Sonnenstab:** Angriff halten, Fläche wählen, loslassen. Die Reichweite wächst
  innerhalb von 3 Sekunden bis 20 Meter. Radius 3,2 Meter; 0,7 Sekunden warmes
  Vorlicht, anschließend 2,4 Sekunden Sonnenstrahl mit acht Schadensimpulsen.
  Gesamtschaden 24 bei gewöhnlicher Seltenheit, Cooldown 4,8 Sekunden.
- Jeder Strahltreffer erneuert die **Aufdeckung für 2,5 Sekunden** (auch in
  Versteckgras) und **Blendung für 2 Sekunden** auf **3 Meter Sichtweite**.
  Kontrollzeiten und Radius skalieren nicht mit Seltenheit. Dächer blockieren
  den vertikalen Strahl; eine seitliche Mauer verhindert keinen von oben
  fallenden Strahl jenseits der Mauer. Normale Sichtblockaden bleiben bestehen.
- **Seelenrichterstab:** direktes Maskenprojektil mit dunklem Flammenschweif;
  Reichweite 18 Meter, Geschwindigkeit 14 m/s, Cooldown 1,2 Sekunden. Drei echte
  Treffer desselben Angreifers vervollständigen eine Rune über dem Opfer.
  Zwei Sekunden danach folgt die automatische Hinrichtung, ohne HP-Schwelle.
  Weitere Treffer verschieben den Countdown nicht. Unvollständige Runen
  verfallen vorläufig nach 8 Sekunden ohne weiteren Treffer. Die Geschosse
  stoppen an Hindernissen; Gegenstände erhalten keine Execute-Markierungen.
- Der Seelenrichter hat keinen zusätzlichen direkten Trefferschaden. Seine
  Execute-Regel bleibt über alle kosmetischen Seltenheitsstufen gleich.
  Er ist ausdrücklich im Editor platzierbar, aber nicht im gewöhnlichen
  Truhenpool: Quest-/Belohnungsvergabe ist im Konzept weiterhin offen.
- Beide echten Tripo-Modelle sind in der Objektauswahl, mit Vorschaubild,
  Kartensymbol, Speichern/Laden, Aufheben und Waffenwechsel eingebunden.
  Die bestehende Karte wird durch die Registrierung nicht verändert.

## Prüfung

Gezielte Tests prüfen tatsächliche Waffensteuerung, Schadensimpulse, Aufdeckung,
Sichtbegrenzung, drei Projektiltreffer, Mauerblockaden, Countdown/Pause,
Kill-Zurechnung, Neustart, Quellhashes, Modellbudgets und Editor-Roundtrip.
`tests/sun_soul_staff_smoke.py` prüft beide Stäbe in den erzeugten Browserdateien,
einschließlich Maus-/Touch-Zielen und eingehender Blendung am lokalen Avatar.

Die Blendung nutzt den gemeinsamen Combat-Status des betroffenen Akteurs. Der
lokale Avatar teilt seine Lebenspunkte mit dem bestehenden Fortschrittssystem.
Das ergänzt keinen neuen Netzwerk-Mehrspielermodus.

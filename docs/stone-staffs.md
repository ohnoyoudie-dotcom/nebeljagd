# Erdbrecherstab und Runenmauerstab

Die beiden Originalmodelle aus `assets/inbox/Erdbrecherstab.glb` und
`assets/inbox/Runenmauerstab.glb` sind unverändert erhalten. Die normalisierten
Spielmodelle haben rund 5.000 Dreiecke und 213 bzw. 218 kB. Beide stehen mit
eigenem Vorschaubild in der Objektauswahl des Editors und unterstützen dessen
übliche Platzierung, Seltenheitsstufen und Export.

## Erdbrecherstab

Angreifen löst eine gerichtete Felswelle aus. Nach 0,38 Sekunden Vorwarnung
brechen versetzt spitze Steine aus dem Boden; Risse, Staub und kleine
Steinsplitter begleiten die Bewegung. Reichweite: 22 m; die Welle verbreitert sich von 1,35 auf 2,8 m, Grundschaden: 18,
Abklingzeit: 1,8 Sekunden. Jeder Gegner wird pro Welle höchstens einmal getroffen.
Wasser, abrupte Geländestufen und feste Hindernisse stoppen die Welle. Deckung
zwischen Welle und Gegner schützt ebenfalls; zerstörbare Hindernisse nehmen
Schaden. Der Schaden skaliert mit der bestehenden Seltenheitslogik.

## Runenmauerstab

Angriff halten erweitert die Reichweite in 0,8 Sekunden auf 10 m. Ein rechteckiger
Grundriss zeigt die 7 m breite Mauer quer zur Zielrichtung; ungültige Stellen
werden rot angezeigt. Loslassen stellt sie nach 0,08 Sekunden Vorwarnung auf; der Aufbau dauert etwa 0,18 Sekunden.
Die 2,3 m hohe Mauer bleibt nach dem Aufrichten 3 Sekunden stehen, besitzt 50
Lebenspunkte und hat 6 Sekunden Abklingzeit. Sie blockiert Bewegung und direkte
Geschosse aus beiden Richtungen. Ihr Besitzer kann durch sie sehen.

Blaue, gemeißelte Steinblöcke steigen versetzt auf, blaue Runen leuchten auf beiden
Seiten. Beim Ablauf oder Zerstören sinken und zerfallen die Blöcke mit begrenztem
Staub und Geröll. Kollision und Kampfziel verschwinden sofort beim Zerstören.
Wasser, Hindernisse, zu starke Neigung und überlappende Figuren verhindern die
Platzierung. Auch während der Vorwarnung hineinlaufende Figuren werden nicht
eingeschlossen. Ein Waffenwechsel entfernt weder die aktive Mauer noch ihre
Abklingzeit. Pause, Neustart und Tod räumen den Effekt korrekt auf.

## Prüfung

- `npm test`: 750 erfolgreiche Tests, darunter sieben neue Tests für beide
  Zauber, Schadenszählung, Platzierungsgrenzen, Sicht, gedrehte Kollision,
  Waffenwechsel und Aufräumen.
- `npm run verify:assets`: Quellen, Hashes, Laufzeitmodelle und Vorschauen.
- `python tests/stone_staffs_smoke.py`: generierten Editor und Spiel im Browser
  prüfen; beide Modelle platzieren und wieder laden; Felswelle mit Schaden und
  Pause; Runenmauer mit Maus und Touch, Kollision, Ablauf und Zerstörung.
  Bilder und Bericht liegen unter `test-results/stone-staffs/`.
- `npm run build` erzeugt und synchronisiert die nutzbaren Dateien in `welt/`.
  Die autorisierte Veröffentlichung aktualisiert ausschließlich die verwalteten
  Preview-Dateien auf `main`; die ursprüngliche Weltkarte bleibt unverändert.

## Quellenhistorie

Der Modell-Upload-Commit ersetzt zusätzlich das Archiv `Seelenrichterstab
Projektil.rar`. Das neue Archiv bleibt unverändert. Damit die bereits verwendete
Seelenprojektil-Version weiterhin anhand ihrer tatsächlichen Quelle prüfbar
bleibt, liegt das frühere Archiv aus Commit `1f48b632` unter
`assets/inbox/source-history/Seelenrichterstab-Projektil-c90b3f56.rar`.
Das bestehende Quellenmanifest verweist auf diese identischen historischen
Bytes. Das Seelenprojektil selbst wurde dadurch nicht verändert.

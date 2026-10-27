# Prüfung des Walddorf-Ausbaus · 2026-10-27

Dieser Bericht hält die erste Walddorf-Fassung fest. Die spätere Anpassung mit
den inzwischen gelieferten Referenzbildern, übersichtlicherer Karte und
Pfeilkollisionen ist in [combat-and-map-update.md](combat-and-map-update.md) dokumentiert.

## Durchgeführte Checks

- Produktionsbuild inklusive eigenständiger `dist/nebeljagd.html` erfolgreich.
- Sechs Node-Tests: Gesundheit/Heilung, Zone, Mauer-Kollision und Gleiten,
  Durchgang durch reale Spielerbreite, Kreis-Hindernisse über Rastergrenzen.
- `npm run verify:assets`: alle sieben Sicherungs-Prüfsummen unverändert;
  GLB gültig, eingebettete Buffer, Skin-Joint-/Weight-Attribute, 18 Gelenke,
  Idle/Walk und 10.123 Dreiecke innerhalb des 15.000er Figurenbudgets.
- Gezielte Produktions-Browserprüfung mit Playwright und System-Chromium:
  WASD/Pfeile/Stop, bewegte Rolle, beide Waffen über E/F, Lebensbalken/Herzen,
  Kristall, echte 45-%-Grasüberblendung und Wiederherstellung, alle drei
  Hausdächer, beide Schlafzimmer-Durchgänge, Schaden/Sicherheit, Touch-Joystick
  und Aktionen sowie Tablet-HUD. Keine JavaScript-/Shaderfehler.
- Die Einzeldatei lädt das Spiel samt GLB mit genau einer HTTP-Anfrage.
- Zusätzlicher tatsächlicher Brückenweg: x 5,7 → 16,9 bei z 5,5, Mitte y 0,28.
  Neues Zauntor durchquert; geschlossener Zaun stoppt den Spieler vor der Geometrie.
- Nach visueller Prüfung schwache lokale SkinnedMesh-Silhouette gegen Kronen-
  Verdeckung sowie verwitterte Steinmaterialien ergänzt; separate Bildprüfung.

Vollständige maschinenlesbare Laufberichte und unveränderte Kameraaufnahmen
liegen unter `test-results/village-smoke.json`, `village-boundaries.json` und
`village-*.png`. Die wiederholbare Prüfung steht in `tests/village_smoke.py`.
Der erste negative Animations-Zeitstempel nach synchronem Weltaufbau wurde
als Integrationsfehler gefunden und behoben; die Simulation startet jetzt bei dt 0.

Die finalen Nachweise sind zusätzlich dauerhaft in `docs/village-smoke.json`,
`docs/village-boundaries.json` und `docs/screenshots/` gesichert. Der ergänzende
`final_visual_check` prüft die letzte Silhouetten-/Steinmaterialfassung. Die
Grasdeckkraft lag dort bei 0,45266, die Wohnraumhöhe bei 0,50; keine Shaderfehler.

## Renderlast und belegbare Grenzen

Vergleich am Spawn, gleiche 1024×768-Spielkamera, hohe Stufe, vor dem letzten
Silhouetten-/Steinmaterialpass:

| Messwert | Gesicherte vorherige 3D-Version | Neuer Walddorf-Stand |
| --- | ---: | ---: |
| Eingereichte Renderaufrufe | 405 | 317 |
| Eingereichte Dreiecke einschließlich Schatten | 601.712 | 1.008.450 |
| Texturen | 4 | 23 |

Die Aufrufe sinken um rund 22 %, während die detailliertere Geometrie steigt.
Der letzte Silhouettenpass ergänzt drei Figuren-Zeichnungen. Dies ist kein
Nachweis einer höheren Hardware-Framerate. Die Software-Framezeiten waren
zusätzlich durch einen parallel laufenden QA-Browser beeinflusst und eignen
sich nicht zum Leistungsvergleich. Die Leistungsstufe reduziert Grasdichte,
Laubdetails, Fernlaubschatten und Schatten-/Renderauflösung.

In den finalen gezielten Ansichten der niedrigen Stufe wurden je nach Ort
269–346 Renderaufrufe und rund 605.000–617.000 Dreiecke einschließlich Schatten
erfasst. Diese Werte umfassen unterschiedliche Sichtfelder und sind deshalb
kein zusätzlicher direkter Vergleich gegen den Spawn-Messpunkt.

**Safari und echte Schul-iPads wurden hier nicht gemessen.** 30 beziehungsweise
60 FPS sind offene Geräteziele. Ein Hardwaretest muss dieselben Kameraorte,
Gerätegeneration, Bildschirmauflösung und Schatteneinstellungen protokollieren.

## Visuelle Abnahme

Es wurden die tatsächlichen Ansichten von Dorf, Gras, Innenraum und Nebel
kontrolliert. Gebäude haben eigenständige Oberflächen und Silhouetten;
Bäume besitzen räumliche Äste/Blätter; Wege und Erde gehen weich ineinander über.
Der harte kreisförmige Grasrand wurde nach dem ersten Vergleich durch eine
unregelmäßige Kontur mit gestaffelter Saumhöhe ersetzt.

Die erwähnten Battlerite-Referenzbilder fehlen. Ein direkter Referenzvergleich
oder eine Gleichwertigkeit mit dessen Produktionsqualität ist nicht belegt.
Einige Dach-/Blattmotive wiederholen sich noch erkennbar. Gebäude, Felsen und
Ruinen können manuell weiter modelliert werden; sie sind bislang prozedurale
Quellen. Nur die Figur besitzt hier einen fertigen Blender-/GLB-Arbeitsweg.
Andere Biome, Gegner, Lerninteraktionen und Online-Multiplayer bleiben außerhalb
dieses auf den Walddorf-Prototyp begrenzten Durchgangs.

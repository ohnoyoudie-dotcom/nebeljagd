# Truhen und zufällige Beute

- Jede neue Runde würfelt Waffen an ihren unveränderten Kartenpositionen und Truheninhalt einmal aus: Weiß 55 %, Grün 27 %, Blau 12 %, Violett 5 %, Gold 1 %.
- Schadensfaktoren: 1 / 1,25 / 1,6 / 1,9 / 2,15. Auch Feuer- und Giftschaden verwenden diese Faktoren. Das Schwert trifft für 27 / 34 / 43 / 51 / 58 Schaden.
- Aufheben und Tauschen behalten die Stufe des Gegenstands. Der Editor legt weiterhin Position und Modell fest und erklärt den Zufallswurf; alte Seltenheitsfelder bleiben beim Bearbeiten erhalten, bestimmen aber keine Spielbeute mehr.
- Das einfache silberne Schwert wurde aus dem Renderer entfernt. Alte `steel`-Einträge und Truhen ohne explizite Modellvariante laden das vorhandene Tripo-Schwert. Originaldateien und Kartendaten bleiben erhalten.
- Die Tripo-Truhe erhält innen gemeinsame Holztexturen mit Maserung, Aststellen, Plankenfugen und leichtem Relief. Neu projizierte UVs decken auch die Deckelunterseite ab; außen bleiben die vorhandenen PBR-Materialien erhalten.

Validierung: 500 Node-Tests, Assetprüfung und vollständiger Standalone-Build bestanden. `tests/chest_loot_browser_smoke.py` prüft die gebauten Dateien: echte Tripo-Truhe, Holzflächen, Tastatur-Öffnen, Touch-Waffenwechsel, Schaden und Farbzuordnung, erneutes Würfeln beim Neustart sowie die Editoranzeige. Dieser Test läuft auch im Veröffentlichungsworkflow. Screenshots und Bericht liegen lokal unter `test-results/chest-loot/`.

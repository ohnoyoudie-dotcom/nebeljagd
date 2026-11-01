# Feuer- und Eiszauber

Die beiden Stäbe besitzen eigene Effekte für Laden, Abschuss, Flug und Treffer.
Sie werden direkt in Three.js erzeugt und benötigen keine zusätzlichen Modelle,
Texturdownloads, Anbieter oder Programme.

| Phase | Feuerstab | Eisstab |
| --- | --- | --- |
| Laden | Warmer Glutkern mit kreisenden Funken am Stabkopf | Heller Kristall mit kreisenden Frostsplittern |
| Abschuss | Orangefarbener Lichtimpuls und kurze Energiespur | Blauer Lichtimpuls und kurze Energiespur |
| Projektil | Heller Kern, bewegte Flammen und Glutspur | Facettierte Kristallspitze und schmale Frostfahne |
| Treffer | Auslaufender Feuerring mit aufsteigenden Funken | Blauer Impuls mit auseinanderfliegenden Eissplittern |

Im Editor einen Feuer- oder Eisstab setzen, **Spielen** öffnen, die Waffe aufnehmen
und mit **F** zaubern. Mit **E** lässt sich zur anderen Waffe wechseln.
Ein bereits fliegender Zauber behält dabei sein ursprüngliches Element.
Der Einschlag erscheint sowohl an Hindernissen als auch an getroffenen Zielen.

`src/spell-effects.js` enthält die visuelle Gestaltung: Farben, Formen, Größen,
Partikelbewegungen und Lebenszeiten. Die Einbindung erfolgt in `src/weapons.js`.
Die Flugbahn bleibt auf der bisherigen Höhe von 1,4 Metern über dem Startboden;
eine kurze Energiespur verbindet die tatsächliche Stabspitze mit dem Flugbeginn.
Schaden, Brennen, Verlangsamung, Fluggeschwindigkeit und Reichweite bleiben gleich.

Die Effekte verwenden gemeinsam genutzte Geometrien und feste Vorräte von
160 Partikeln und zwölf Impulsen. Wiederholtes Zaubern fügt keine Szenenobjekte
hinzu. Nebelsicht und Tiefentest gelten auch für die Effekte. Rollen oder ein
Waffenwechsel während des Ladens brechen den noch nicht abgeschossenen Zauber ab.
Pause hält die Effekte an; ein Neustart entfernt alle laufenden Effekte.

Nach Anpassungen Tests und `npm run build` ausführen. Dadurch landet der aktuelle
Spielstand auch in `welt/nebeljagd.html`, das der Editor über **Spielen** öffnet.
Der Browsercheck `python3 tests/spell_effects_smoke.py` startet seinen eigenen
lokalen Server und prüft die tatsächlich erzeugten Dateien unter `/preview/`.
Er verändert nur einen Testentwurf im Browser; die gespeicherte Nutzerkarte
bleibt unverändert.

Geprüfter Build: `e2b9356f0be1`. 344 Node-Tests und fünf Browserprüfungen
bestanden. Die zehn Browserbilder zeigen den Editor, jeweils Laden, Abschuss,
Flug und Einschlag beider Stäbe sowie den Neustart während eines aktiven Effekts.
Keine Browser-, Shader- oder HTTP-Fehler.
Prüfbericht: [spell-effects-check.json](spell-effects-check.json).

Veröffentlicht: [Editor öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=90b28a7).
Alte Spiel-Tabs schließen und über **Spielen** neu öffnen.
Commit `90b28a782679a9ef0d201d0f4f9e8f6cf5779287` aktualisiert ausschließlich `preview/` auf `main`.
[GitHub-Pages-Bereitstellung](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41313067996) erfolgreich; Quellstand `058f350b00814ea3dc38156ae0ffbbf1c7fdee94`.
Das veröffentlichte Release-Protokoll stimmt mit dem geprüften Paket überein.
Direkter Pages-HTTP-Zugriff ist in dieser Umgebung durch die Netzwerkpolicy
gesperrt; der Browsercheck lief mit identischen Dateien lokal.

# Nebeljagd – Zauberstäbe: Konzept und Übergabe an Codex

**Stand:** 9. November 2026  
**Repository:** `ohnoyoudie-dotcom/nebeljagd`  
**Entwicklungsbranch:** `work` (nicht automatisch `main`)  
**Spiel:** 3D-Top-Down-Fantasy-Kampfspiel, häufig 1-gegen-1; Zielgruppe 5./6. Klasse.

## Zweck dieser Datei

Diese Datei ist ein **Designbriefing, noch kein Implementierungsauftrag für alle Waffen**. Es dokumentiert die gemeinsam festgelegte Richtung und trennt bestätigte Spielideen von **vorläufigen Balancing-Werten**. Codex soll bestehende Spielsysteme bewahren und neue Waffen schrittweise entwickeln.

## Bestehende Waffen (bereits im Spiel)

1. **Feuerstab** – Feuerprojektil mit Brandschaden.
2. **Eisstab** – Eisgeschoss, verlangsamt getroffene Gegner.
3. **Giftstab** – geworfener Zauber mit markierter Zielfläche, anhaltende Giftwolke.
4. **Mondstab** – durchdringende, zurückkehrende Mondsichel.

Der Code des Branches `work` enthält u. a. `src/loot-tiers.js`, `src/weapons.js`, `src/special-weapons.js`, `src/combat.js`, `src/main.js`, `src/rules.js`, `src/spell-effects.js` und Karteneditor-Systeme. Diese vor Arbeiten prüfen, nicht blind überschreiben.

**Beim Prüfen des aktuellen Codes festgestellt:** `MAX_HEALTH=100`, `START_HEALTH=72`, `ROLL_COOLDOWN=2.5`, `ROLL_DURATION=0.72` in `src/rules.js`. Diese Werte können sich später geändert haben; Codex soll sie vor Änderungen erneut lesen.

## 16 geplante neue Zauberstäbe (aus dem Ideenchats festgehalten)

| Nr. | Name | Kerneffekt / vereinbarte Richtung |
|---:|---|---|
| 5 | **Gravitationsstab** | Zielbereich zieht Gegner begrenzt zur Mitte; danach eine Explosion. Gegner können dagegen anlaufen oder mit verfügbarer Rolle entkommen. Kein oder sehr wenig Schaden beim Sog, Hauptschaden beim Kollaps. |
| 6 | **Dornenstab** | Markierbare Stelle wie beim Giftstab; Dornen wachsen aus dem Boden. Man kann hindurchlaufen, wird aber langsamer und erleidet etwas Schaden. Keine undurchdringliche Dornenwand. |
| 7 | **Sanduhrstab** | Zeitsiegel bricht auf; je länger Gegner im Feld bleiben, desto langsamer bewegen sie sich. **Kein vollständiges Einfrieren**; Effekt wird bei Verlassen beendet/abgebaut. |
| 8 | **Sonnenstab** | Sanftes Leuchten kündigt die Fläche an; nach Verzögerung trifft ein Lichtstrahl von oben, wird deutlich breiter, verursacht Schaden über Zeit und deckt Gegner für einige Sekunden auf, auch im Gras. Ersetzt die frühere Sternenstab-Idee. |
| 9 | **Rabenstab** | Direkt zielsuchender Schattenrabe; begrenzte Reichweite, Lebensdauer und Wendigkeit; Wände blockieren ihn; ausweichbar. Nicht unfehlbar. |
| 10 | **Erdbrecherstab** | Boden reißt entlang einer Linie in Blickrichtung auf; Felszacken kommen nach Vorwarnung hervor, treffen Gegner. |
| 11 | **Gezeitenstab** | Wasserwelle wird im Lauf zunehmend breiter und stößt Gegner etwas zurück. Sichtbar hochwertiger Wassereffekt. Blockierte Wellenabschnitte stoppen an Hindernissen, freie seitliche Teile können weiterlaufen; kein Schaden durch Wände. |
| 12 | **Echostab** | Zwei zeitversetzte Projektile. Zweiter Schuss folgt der **ursprünglichen Flugrichtung** des ersten, nicht zielsuchend. |
| 13 | **Prismenstab** | Kristallprojektil wird auf dem Flug größer und dadurch leichter zu treffen; Schaden und Breite gegeneinander ausbalancieren. |
| 14 | **Runenmauerstab** | Erzeugt kurzlebige steinerne Mauer, die zerfällt. Sicht durch die Mauer, eigene/gegnerische Projektile und zerstörbare Deckung müssen balanciert werden. Diskutierte bevorzugte Testvariante: Besitzer kann durchsehen, beide Seiten werden bei direkten Projektilen blockiert. |
| 15 | **Seelenrichterstab** | **Sehr seltene besondere/legendäre Execute-Waffe.** Drei erfolgreiche Treffer setzen je ein Fragment einer dreiteiligen Rune oder eines Totenkopfs **über dem gegnerischen Charakter**. Beim dritten Treffer vollständig: kurzer Leuchteffekt und nach **2 Sekunden automatischer Execute** (Variante A). Erwerb eventuell als einmalige Karten-Quest/Belohnung statt gewöhnlichem Drop; noch nicht entschieden. Trefferfenster/Cooldown fair abstimmen, visuell klar ankündigen. |
| 16 | **Meteorstab** | Meteorit fliegt in **hohem Bogen** zur markierten Stelle, Einschlag mit Explosion. Danach fliegen wenige kleine **brennende Splitter/Projektile** weg: wenig Trefferschaden, können Brand auslösen. Treffer pro Ziel begrenzen. |
| 17 | **Runenminenstab** | Markierbare Rune am Boden: kurz deutlich aufleuchten, danach blasser, aber erkennbar. Bei Gegnerannäherung Warnleuchten und Explosion. **Mehrere gleichzeitig, aber begrenzte Zahl**; Idee: max. 3 aktive, jede zeitlich begrenzt; die älteste erlischt bei weiterem Setzen. |
| 18 | **Blinkstab** | Kurzer Teleport zu markiertem Zielpunkt (z. B. über geworfene/geschickte Lichtkugel). Kein oder kaum Schaden, klare Zielanzeige; keine Durchquerung geschlossener Mauern. |
| 19 | **Lanzenstab** | Aufladbarer, schneller, schmaler Energiestrahl als Präzisionswaffe. Schaden erhöht sich durch Aufladung; sichtbare Vorwarnung und Ausweichmöglichkeit. |
| 20 | **Reflexionsstab** | Bewegt sich mit dem Spieler: kurze, rundum wirkende Schutzkuppel. Feindliche Projektile **prallen sichtbar ab** und verursachen am geschützten Spieler keinen Schaden. Direkte Projektiltreffer geschützt; Nahkampf und Boden-/Flächenzauber nicht pauschal. Ob abgeprallte Schüsse Gegner verletzen, zunächst **nein**; Stärke und konkrete Regeln testen. |

**Ausdrücklich verworfen:** Resonanzstab, Sandsturmstab. Ungewöhnliche Nicht-Stab-Waffen vorerst nicht weiterentwickeln.

## Prinzipien für Spielgefühl und Darstellung

- **Einfachheit für 5./6. Klasse:** Ein klar lesbarer Haupteffekt pro Stab. Wenige Sekunden, klare Warnung, verständliche Ausweichmöglichkeit.
- **1-gegen-1-Balancing:** Wer größere Trefferflächen hat, sollte häufig geringeren Schaden, längeren Cooldown oder deutliche Vorwarnungen erhalten. Kombination aus hohem Schaden, enormer Fläche und vielen Kontrollwirkungen vermeiden.
- **Roll-Cooldown beachten:** Im aktuellen Code 2,5 Sekunden. Rolle soll taktische Ausweichoption sein, kein unendlicher Ausweichknopf.
- **Drei Angriffsformen:** präzise Projektile; während des Flugs breiter werdende Geschosse; bleibende Flächen.
- **Hohe Flugkurven:** etwa Meteor und geworfene Runen; dürfen niedrige Hindernisse je nach tatsächlicher Höhe überwinden, aber nicht beliebig durch massive Mauern fliegen.
- **Statusanzeigen:** Effekte wie Brennen, Gift, Verlangsamung möglichst direkt an der Figur zeigen (Flammen, Partikel, Fußringe); nicht viele Symbole über dem Lebensbalken stapeln. **Nur die dreiteilige Execute-Rune über der Figur** als eigener besonders wichtiger Hinweis.
- **Raritäten:** Seltenheiten dürfen Schaden modifizieren; Kontrollzeiten, Execute-Regeln und Trefferflächen sollten nicht automatisch mit Rarität eskalieren.
- **Sicht/Kollision:** bestehende Kollisions-, Deckungs-, Nebel-/Gras-, Editor- und Pickup-Regeln beachten.
- **Grafik:** hochwertiger, klar erkennbarer stilisierter Fantasy-Look, auch in Top-Down-Kamera; Effekte ohne unnötige GPU-Belastung, mit Blick auf spätere iPad-Nutzung.

## Vorläufige Testwerte – ausdrücklich nicht endgültig beschlossen

| Stab | Erstes Test-Balancing aus der Diskussion |
|---|---|
| Gravitation | etwa 2 m Radius, maximal ~1,2 m Zug, ~12 Schaden beim Kollaps, ~2,8 s Cooldown |
| Dornen | ~1,9 m Radius, ~2,8 s Standzeit, 25 % Verlangsamung, ~3 Schaden/s, ~2,6 s Cooldown |
| Sanduhr | ~2,3 m Radius, Verlangsamung bis höchstens ~65 %, kein direkter Schaden, ~3,1 s Cooldown |
| Sonne | nach ~0,7 s Vorwarnung wachsender Lichtstrahl, ~1,8 s aktiv, ~7 Schaden/s, Aufdeckung ~2,5 s, ~3,2 s Cooldown |
| Rabe | Zielsuche innerhalb eines Kegels, ~12 Schaden, ~2,1 s Cooldown; Blockade durch Wände |
| Erdbrecher | ~18 Schaden, ~1,8 s Cooldown |
| Gezeiten | ~12 Schaden, Rückstoß etwa 1 m, ~2 s Cooldown |
| Echo | zwei Treffer ~11 + ~9 Schaden, ~1,7 s Cooldown |
| Runenmauer | etwa 3 s Standzeit, ~3,5 m Länge, ~6 s Cooldown, kein Direktschaden |
| Runenmine | bis zu drei aktiv, ~12 s Lebensdauer, ~3 s pro Platzierung, ~16 Schaden bei Auslösung |
| Blink | ~8 m Reichweite, ~4 s Cooldown, kein Schaden |
| Lanze | bis ~1 s laden, je nach Ladezustand ~12–30 Schaden, ~1,5 s Cooldown |
| Reflexion | ~1,8 s Schutz, ~8 s Cooldown, kein Direktschaden |

**Gravitationsstab, überarbeiteter Prototyp:** Zielreichweite wächst wie beim
Giftstab in 3 s von 0 auf 10 m; Loslassen wirft ein violettes Bogenprojektil.
Nach dem Aufprall öffnen Landungsanimation und Feldöffnung das Feld in der
bestehenden 0,4-s-Vorwarnung. Radius 3,2 m, 1,0 s Sog mit maximal 1,5 m Verschiebung je Gegner,
einmalig 14 Grundschaden beim Kollaps, danach 0,65 s visuelles Abklingen.
Cooldown 2,8 s ab Loslassen. Radius, Zug und Zeiten bleiben unabhängig von der
Seltenheit. Genaue Bedienung und Darstellung: [gravitationsstab.md](gravitationsstab.md).

**Spezialfall Seelenrichter:** Die automatische Hinrichtung nach dem dritten Treffer + 2 s wurde gewünscht; ein zusätzliches Leben-Schwellen-Kriterium wurde **nicht** gewählt. Unklar und noch zu testen: Zeit zwischen den drei Treffern, Gegenmaßnahmen im Countdown, Drop/Quest-Details, Interaktion mit anderen Schutzzaubern. Nicht eigenmächtig in eine andere Execute-Variante ändern.

## Empfehlung: In kleinen Codex-Schritten arbeiten

1. **Bestandsaufnahme, noch keine Codeänderung:** Codex soll `AGENTS.md` und relevante Waffen-, Projektil-, Kollision-, Editor- und Testmodule auf `work` lesen und die Erweiterungspunkte zusammenfassen.
2. **Architekturvorschlag:** Datenmodell für zusätzliche `weaponType`-Einträge; Wiederverwendung von AOE-Zielanzeige, Status, Cooldowns, Schussbahnen und Rendering; Editorintegration. Rückwärtskompatibilität zu bestehenden Karten.
3. **Ein Waffen-Prototyp:** Zuerst **Gravitationsstab** oder **Sonnenstab**. Bei Bedarf nach Nutzerentscheidung auswählen; nicht alle 16 gleichzeitig implementieren.
4. **Prüfen:** Schaden, Cooldowns, Ausweichen/Rolle, Wände, Animationseffekte, Karteneditor, Aufheben/Wechseln, Neustart, Tests und Performance.
5. **Danach** überarbeitete Zahlen als Designentscheidungen in dieser Datei festhalten und nächste Waffe bearbeiten.

## Copy-Paste-Auftrag für Codex

> Arbeite im Repository `ohnoyoudie-dotcom/nebeljagd` auf Branch `work`. Lies zuerst `AGENTS.md` und `docs/zauberstaebe-konzept.md` (bzw. die beigefügte Datei `nebeljagd_zauberstaebe_codex_briefing.md`). Das Dokument enthält unseren verbindlichen Ideenkatalog für 16 neue Zauberstäbe plus 4 bestehende Waffen. **Bitte zunächst keine Änderungen am Spiel vornehmen.** Prüfe die bestehende Architektur für Waffen, Status, Projektilkollisionen, Cooldowns, Rolle, Sichtbarkeit und Karteneditor. Erstelle einen kurzen technischen Umsetzungsplan mit Wiederverwendung bestehender Mechaniken, notwendigen neuen Komponenten, Risiken und sinnvollen Tests. Priorisiere einen einzelnen Prototypen und nenne die Stellen, an denen noch Designentscheidungen erforderlich sind. Überschreibe keine vorhandenen Karten/Assets und arbeite nicht versehentlich auf `main`.

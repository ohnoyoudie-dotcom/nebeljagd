# Gravitationsstab – drei Sekunden Sog, aufsteigende Kugel und letzter Flächenimpuls

Der neue Stab verwendet das bereits hochgeladene Original
assets/inbox/fantasy voidstaff 3d model.glb (ca. 65 MB).
Die Originaldatei bleibt unverändert. Der CI-Build bereitet über
scripts/prepare-gravity-staff.py eine kleine, offline ladbare GLB-Kopie vor
(assets/imported/tripo-gravity-staff/runtime/gravity-staff.glb).

## Bedienung und Kampfwirkung
- Im Editor unter **Objekte → Einzeln → Gravitationsstab · Tripo** auswählen
  und wie andere Waffen platzieren. Die Projektkarte wird nicht automatisch bearbeitet.
- Unbewaffnet die Waffe aufnehmen oder mit **E** wechseln.
- **F / Angriff halten**, den schlichten Zielkreis ausrichten, **loslassen**.
  Am Computer funktionieren auch die linke Maustaste und der aktuelle Mauszeiger.
  Auf Touch-Geräten die Angriffstaste halten und mit dem linken Stick die Richtung wählen.
- Wie beim Giftstab wächst der Reichweitenkreis beim Halten vom Spieler aus:
  0 m beim Drücken, 10 m nach 1,5 s und maximal 20 m nach 3 s.
  Beide Stäbe verwenden dieselbe lineare Ladefunktion, maximale Reichweite
  und einfache Ringdarstellung. Die Zielfläche hat keine Runen oder Animation.
  Ein näherer Mauszeiger wird nicht überschossen. Frühes Loslassen wirft das Projektil näher.
  Das Halten allein löst keinen Angriff aus; jede neue Betätigung beginnt bei null.
- Der Wirkungsradius beträgt **4,5 m**, also **9 m Durchmesser**. Die Fläche ist
  damit knapp doppelt so groß wie beim vorherigen Radius von 3,2 m.
  Die Haltedauer verändert die erreichbare Entfernung, nicht Radius oder Schaden.
- Beim Loslassen fliegt ein dunkelviolettes Projektil vom tatsächlichen Stabkopf
  zum gewählten Punkt. Fluggeschwindigkeit 10 m/s, mindestens 0,5 s Flugzeit,
  zusätzliche Bogenhöhe 3,2 m. Die Zielposition bleibt während des Flugs fest.
- Die vorhandene Projektilkollision tastet den Bogen in Schritten von höchstens
  1/60 s ab. Niedrige, sichtdurchlässige Deckung folgt derselben Regel wie beim
  Giftwurf; massive Hindernisse fangen das Projektil ab. Wasser erzeugt kein Feld.
- **Ab dem Aufprall** folgen weiterhin 0,4 s Vorwarnung. Diese Zeit besteht jetzt
  aus einer Landung mit Druckwelle, Staub und aufsteigender Energie und der
  anschließenden Öffnung des Bodenstrudels. Während des Flugs entsteht noch kein Feld.
- Anschließend **3,0 s Sog** mit 0,5 m/s, höchstens 1,5 m Gesamtverschiebung pro Gegner.
  Keine Bewegung durch geschlossene Hindernisse; der Gegner kann dagegenlaufen
  bzw. durch rechtzeitige Rolle entkommen. Sog selbst verursacht keinen Schaden.
- Beim Kollaps 14 Grundschaden, Seltenheitsstufen multiplizieren nur den Schaden.
  Der Treffer erfolgt **3,4 s nach dem Aufprall**, genau einmal pro erreichbarem Ziel.
  Ein letzter Flächenimpuls dauert **0,22 s**. Danach sind Bodenstrudel, Kugel,
  Staub, Trümmer, Schalenstücke und Druckwelle vollständig verschwunden.
  Es gibt keine zweite Trefferberechnung während dieses kurzen Abschlusses.
  Der Besitzer wird weder gezogen noch getroffen. Zerstörbare Gegenstände
  werden nicht angesaugt.
- Angriffs-Cooldown: 2,8 s, separat von der bestehenden Rolle (2,5 s).
  Der Cooldown beginnt beim Loslassen. Escape/Pause, Rolle und Waffenwechsel
  brechen das Zielen ab, ohne einen Zauber auszulösen.
  Gleichzeitig ist höchstens ein vollständiger Gravitationszauber aktiv.
  Eine neue Ladung beginnt erst nach dessen vollständigem Ende.

## Darstellung

- Das Flugprojektil verwendet das hochgeladene **Void Projektil.glb**:
  schwarzer Kern mit violetter Spirale, entlang des Wurfbogens ausgerichtete
  Spitze und Rotation um die Flugachse. Zwei Energiebahnen, acht umlaufende
  Partikel und der vorhandene Element-Schweif begleiten das Modell.
  Auch der Einschlag verwendet das gemeinsame Effekt-System.
- Das Original unter `assets/inbox/` bleibt bytegenau erhalten (63.232.376 Byte).
  `scripts/prepare-gravity-projectile.py` erzeugt über die vorhandene Blender-
  Pipeline eine getrennte Laufzeitdatei: 235.348 Byte, 4.000 Dreiecke und drei
  eingebettete PBR-Texturen mit höchstens 256×256 Pixeln. Der Loader richtet
  die ursprüngliche +Y-Spitze auf +Z aus und normalisiert die Länge auf 1,10 m.
  Die Darstellung skaliert Modell, Leuchten und Energiebahnen gemeinsam auf 80 %;
  das sichtbare Modell ist dadurch 0,88 m lang. Kollisionsgröße, Flugbahn,
  Schaden, Zeiten und Stabmodell bleiben erhalten; das Feld nutzt den obigen größeren Radius.
  Geometrie und Texturen werden geteilt; nur veränderliche Materialien gehören
  den wiederverwendeten Projektilen. Pause und Sichtprüfung gelten auch für das Modell.
- Die Landung zeigt eine breite violette Druckwelle, 32 weiche Staubschwaden,
  eine aufsteigende Energiesäule und eine kurz aufploppende Energieblase.
- Erst danach öffnet sich ein durchgehend violett gefärbter Strudel.
  Breite Spiralbänder unterscheiden sich durch ihre Farbe; zwischen ihnen bleibt
  die Fläche gefüllt. Kleine, weich auslaufende Wirbel geben dem sonst regelmäßigen
  Rand leichte Wellen. Die transparente Geometrie reicht maximal bis 3,712 m;
  der sichtbare Rand bleibt innerhalb dieser Grenze. Die Ausläufer verursachen keinen
  zusätzlichen Sog oder Schaden; der Wirkungsradius bleibt 3,2 m.
- Die gemalte Boden-Textur übernimmt die breiten violetten Strömungen, feinen
  Farbfäden und den dunklen Mittelpunkt aus der vorgegebenen Dreiphasen-Referenz.
  Ihre aufgemalte kreisrunde Randlinie wird beim Abtasten ausgespart; eine breite,
  animierte Spiralmaske lässt den ruhigeren Rand ohne harten Kreisschnitt auslaufen.
  Die Farben werden im sRGB-Raum
  geladen und ohne zusätzliche Umfärbung dargestellt. Der Drehwinkel animiert
  diese Strömungen im vorhandenen Material.
- Drei eigene ImageGen-Texturen liegen unter `assets/effects/gravity-reference/`:
  Boden 1024×1024, Kugelrisse 512×256 und Ausbruchsblitz 512×512. Zusammen
  241.018 Byte WebP und etwa 7,33 MiB RGBA-Texturspeicher einschließlich Mipmaps.
  Das Paket enthält Prompts, Herkunft, Nutzungsnachweis und ein geschlossenes
  Hash-Verzeichnis; `npm run verify:assets` prüft Bytes, Formate und Speicherbudgets.
  Die Originalbilder bleiben außerhalb des Laufzeitpakets erhalten.
- Die Bodenfläche bildet eine flache, 0,26 m tiefe Schale mit erhöhtem Außenrand.
  Sie folgt einmal pro Platzierung der bestehenden Geländehöhe und verändert
  weder Gelände noch Karte. Schattierung und geringe Wellen geben zusätzliche Tiefe.
- Die Spiralbänder wandern nach innen. Während des Sogs steigt die Drehgeschwindigkeit
  über drei Sekunden von **0,18 auf 6,6 rad/s**. Der Anfang ist deutlich langsamer;
  die Beschleunigung nimmt stetig zu. Der Drehwinkel wird analytisch aus der
  Simulationszeit berechnet.
- Aus der Mitte steigt eine dunkle Energiekugel mit leuchtenden violetten Rissen.
  Ihr Mittelpunkt steigt während des Sogs von 0,13 auf 1,73 m über der Feldbasis,
  ihr Radius wächst von 0,10 auf 0,75 m. Eine schmale Energieverbindung reicht zum Zentrum.
- 64 wiederverwendete Fragmente aus Stein und Gras, 160 Bodenpartikel und
  zurückhaltende Lichtspuren ziehen in unregelmäßigen Schüben nach innen.
  Vorbereitete Startzeiten, Pausen, Flugzeiten, Winkel und Abstände unterscheiden
  sich pro Fragment. Die Trümmer bilden keine regelmäßige Perlenkette.
  Sie steigen auf den letzten Windungen zur gleichzeitig wachsenden Kugel auf
  und werden erst innerhalb ihrer Oberfläche unsichtbar. Vor dem Zerplatzen
  nimmt die Kugel alle übrigen Fragmente auf; danach entstehen keine neuen.
  Das vorhandene Gras-System erhält begrenzte
  Interaktoren, welche die Halme sichtbar zur Feldmitte biegen.
- Bis zu acht sichtbare Gegner erhalten violette Körperenergie und Fußrunen.
  Ihre Figuren stemmen Arme und Beine gegen den Sog und kippen sichtbar mit.
- Beim Kollaps zerplatzt die große Kugel vollständig in 24 gemeinsam gezeichnete
  Schalenfragmente, die nach außen fliegen. Es bleibt keine intakte Halbkugel zurück.
  Ein weiß-violetter Blitz am Ort der aufgestiegenen Kugel und eine breite violette
  Druckfront mit gefärbter Nachströmung vom Zentrum über den gesamten Wirkungsradius
  zeigen den einen Treffer. Die Front bleibt hell, bis sie die Außenkante erreicht.
  Sie verwendet dieselbe geländefolgende Geometrie wie der Strudel und bildet
  keine zusätzliche Luftblase. Der Bodenstrudel
  zieht sich unter diesem Impuls innerhalb von 0,11 s zurück; nach insgesamt
  0,22 s endet die gesamte Darstellung ohne weitere Wellen oder schwebende Reste.
- Vorwarnung, Sog, Kollaps und Abklingen laufen über dieselbe Simulationszeit.
  Pause friert sie ein, Sichtprüfung und Tiefentest verbergen verdeckte Effekte.
- Instanz-Geometrie bündelt Partikel, Trümmer und Gegnerreaktionen. Die Feld-
  Darstellung bleibt auch mit acht betroffenen Gegnern bei höchstens 15 Zeichenschritten,
  die gepoolte Landung benötigt vier. Die Texturen werden vor Spielbereitschaft
  einmal geladen und als Daten-URLs eingebettet, auch für die Offline-Ausgabe.
  Keine dynamischen Lichtquellen oder Bildschirm-Postprocessing-Effekte.

## Prüfweg
1. npm test, npm run verify:assets, npm run map:check, npm run build.
   `NEBELJAGD_URL=http://127.0.0.1:4176 python tests/gravity_staff_smoke.py`
   prüft Maus und Touch am erzeugten Spiel und erfasst Flug, Landung, Öffnung,
   Sog, Kugelaufstieg und Zerplatzen. Pixelproben des echten GPU-Bilds prüfen
   die gefüllte violette Fläche sowie die Burstwelle im Zentrum und am Außenrand;
   Zustandsprüfungen erfassen das geladene Void-Modell, Beschleunigung,
   Kugelwachstum und den weiterhin einmaligen Schaden. Vier vergrößerte echte
   Spielaufnahmen (`reference-start`, `reference-grown`, `reference-burst`, `reference-wave`)
   erlauben den direkten Vergleich mit dem Entwurf. Eine zusätzliche Aufnahme
   `reference-clear` und echte GPU-Pixelproben prüfen die leere Fläche nach dem Impuls.
   Ein zweiter echter Zauber auf freier Fläche prüft in jedem CI-Lauf auch das
   unverdeckte Zentrum, damit angesaugte Figuren und Lebensbalken die Pixelprüfung
   nicht verfälschen. Mit `NEBELJAGD_GRAVITY_REFERENCE=1` erfasst derselbe Test
   zusätzlich alle vier vergrößerten Phasen dieses freien Zaubers.
2. Im Editor den neuen Stab neben Übungsgegnern platzieren, **Spielen** öffnen,
   aufnehmen, Ziel markieren und Flug, Landung, Feldöffnung, Sog und Explosion ansehen.
3. Den Angriff mit Rolle, Hindernissen, Waffenwechsel und Neustart prüfen.
4. In der Offline-Ausgabe welt/map-editor.html / welt/magebrawl.html testen.

Status: Entwicklungsstand. Zahlen, Animation und Materialwirkung werden beim
gemeinsamen Feinschliff angepasst. CI-/Browser-Prüfungen sind erst nach
erfolgreichem Lauf als bestanden anzusehen.

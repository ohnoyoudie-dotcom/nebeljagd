# Gravitationsstab – Wurfprojektil, Landung, Sog und mehrstufiger Kollaps

Der neue Stab verwendet das bereits hochgeladene Original
assets/inbox/fantasy staff 3d model.glb (ca. 65 MB).
Die Originaldatei bleibt unverändert. Der CI-Build bereitet über
scripts/prepare-gravity-staff.py eine kleine, offline ladbare GLB-Kopie vor
(assets/imported/tripo-gravity-staff/runtime/gravity-staff.glb).

## Bedienung und Kampfwirkung
- Im Editor unter **Objekte → Einzeln → Gravitationsstab · Tripo** auswählen
  und wie andere Waffen platzieren. Die Projektkarte wird nicht automatisch bearbeitet.
- Unbewaffnet die Waffe aufnehmen oder mit **E** wechseln.
- **F / Angriff halten**, den violetten Zielkreis ausrichten, **loslassen**.
  Am Computer funktionieren auch die linke Maustaste und der aktuelle Mauszeiger.
  Auf Touch-Geräten die Angriffstaste halten und mit dem linken Stick die Richtung wählen.
- Wie beim Giftstab wächst der Reichweitenkreis beim Halten vom Spieler aus:
  0 m beim Drücken, 5 m nach 1,5 s und maximal 10 m nach 3 s.
  Ein näherer Mauszeiger wird nicht überschossen. Frühes Loslassen wirft das Projektil näher.
  Das Halten allein löst keinen Angriff aus; jede neue Betätigung beginnt bei null.
- Der Wirkungsradius beträgt **3,2 m**, also **6,4 m Durchmesser**. Die Fläche ist
  damit gut doppelt so groß wie beim bisherigen Radius von 2,2 m.
  Die Haltedauer verändert die erreichbare Entfernung, nicht Radius oder Schaden.
- Beim Loslassen fliegt ein dunkelviolettes Projektil vom tatsächlichen Stabkopf
  zum gewählten Punkt. Fluggeschwindigkeit 10 m/s, mindestens 0,5 s Flugzeit,
  zusätzliche Bogenhöhe 3,2 m. Die Zielposition bleibt während des Flugs fest.
- Die vorhandene Projektilkollision tastet den Bogen in Schritten von höchstens
  1/60 s ab. Niedrige, sichtdurchlässige Deckung folgt derselben Regel wie beim
  Giftwurf; massive Hindernisse fangen das Projektil ab. Wasser erzeugt kein Feld.
- **Ab dem Aufprall** folgen weiterhin 0,4 s Vorwarnung. Diese Zeit besteht jetzt
  aus einer Landung mit Druckwelle, Staub und aufsteigender Energie und der
  anschließenden Öffnung des Runenfelds. Während des Flugs entsteht noch kein Feld.
- Anschließend 1,0 s leichter Sog, höchstens 1,5 m Gesamtverschiebung pro Gegner.
  Keine Bewegung durch geschlossene Hindernisse; der Gegner kann dagegenlaufen
  bzw. durch rechtzeitige Rolle entkommen. Sog selbst verursacht keinen Schaden.
- Beim Kollaps 14 Grundschaden, Seltenheitsstufen multiplizieren nur den Schaden.
  Der Treffer erfolgt **1,4 s nach dem Aufprall**, genau einmal pro erreichbarem Ziel.
  Keine zweite Trefferberechnung während der anschließenden 0,65 s Ausblendung.
  Der Besitzer wird weder gezogen noch getroffen. Zerstörbare Gegenstände
  werden nicht angesaugt.
- Angriffs-Cooldown: 2,8 s, separat von der bestehenden Rolle (2,5 s).
  Der Cooldown beginnt beim Loslassen. Escape/Pause, Rolle und Waffenwechsel
  brechen das Zielen ab, ohne einen Zauber auszulösen.
  Gleichzeitig ist höchstens ein vollständiger Gravitationszauber aktiv.

## Darstellung

- Das Flugprojektil hat einen schwarzen violett umleuchteten Kern, zwei
  rotierende Energiebahnen, acht umlaufende Partikel und den vorhandenen
  Element-Schweif. Auch der Einschlag verwendet das gemeinsame Effekt-System.
- Die Landung zeigt eine breite violette Druckwelle, 32 weiche Staubschwaden,
  eine aufsteigende Energiesäule und eine kurz aufploppende Energieblase.
- Erst danach öffnet sich ein rotierender Runenrand auf den tatsächlichen Radius.
- Während des Sogs krümmen sich mehrere Spiralströme vom Boden zu einem
  schwebenden dunklen Kern. Zwei geneigte Umlaufbahnen zeigen dessen Rotation.
- 56 wiederverwendete Gesteinssplitter, 120 Bodenpartikel und Lichtspuren werden
  angehoben und nach innen gezogen. Das vorhandene Gras-System erhält begrenzte
  Interaktoren, welche die Halme sichtbar zur Feldmitte biegen.
- Bis zu acht sichtbare Gegner erhalten violette Körperenergie und Fußrunen.
  Ihre Figuren stemmen Arme und Beine gegen den Sog und kippen sichtbar mit.
- Vor dem Kollaps zieht sich der schwarze Kern zusammen. Ein heller Blitz, eine
  räumliche Druckwelle und drei zeitversetzte Bodenringe zeigen den einen Treffer. Trümmer
  werden kurz nach außen geschleudert und blenden aus.
- Vorwarnung, Sog, Kollaps und Abklingen laufen über dieselbe Simulationszeit.
  Pause friert sie ein, Sichtprüfung und Tiefentest verbergen verdeckte Effekte.
- Instanz-Geometrie bündelt Partikel, Trümmer und Gegnerreaktionen. Die Feld-
  Darstellung bleibt auch mit acht betroffenen Gegnern bei höchstens 15 Zeichenschritten,
  die gepoolte Landung benötigt vier. Keine neuen externen Texturen,
  dynamische Lichtquellen oder Bildschirm-Postprocessing-Effekte.

## Prüfweg
1. npm test, npm run verify:assets, npm run map:check, npm run build.
   `NEBELJAGD_URL=http://127.0.0.1:4176 python tests/gravity_staff_smoke.py`
   prüft Maus und Touch am erzeugten Spiel und erfasst Flug, Landung, Öffnung,
   Sog und Kollaps.
2. Im Editor den neuen Stab neben Übungsgegnern platzieren, **Spielen** öffnen,
   aufnehmen, Ziel markieren und Flug, Landung, Feldöffnung, Sog und Explosion ansehen.
3. Den Angriff mit Rolle, Hindernissen, Waffenwechsel und Neustart prüfen.
4. In der Offline-Ausgabe welt/map-editor.html / welt/magebrawl.html testen.

Status: Entwicklungsstand. Zahlen, Animation und Materialwirkung werden beim
gemeinsamen Feinschliff angepasst. CI-/Browser-Prüfungen sind erst nach
erfolgreichem Lauf als bestanden anzusehen.

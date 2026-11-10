# Gravitationsstab – aufladbares Zielgebiet und räumlicher Kollaps

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
  Ein näherer Mauszeiger wird nicht überschossen. Frühes Loslassen setzt das Feld näher.
  Das Halten allein löst keinen Angriff aus; jede neue Betätigung beginnt bei null.
- Der Wirkungsradius beträgt **3,2 m**, also **6,4 m Durchmesser**. Die Fläche ist
  damit gut doppelt so groß wie beim bisherigen Radius von 2,2 m.
  Die Haltedauer verändert die erreichbare Entfernung, nicht Radius oder Schaden.
- Nach dem Loslassen bleibt das Feld am gesetzten Ort: **0,4 s Vorwarnung**.
- Anschließend 1,0 s leichter Sog, höchstens 1,5 m Gesamtverschiebung pro Gegner.
  Keine Bewegung durch geschlossene Hindernisse; der Gegner kann dagegenlaufen
  bzw. durch rechtzeitige Rolle entkommen. Sog selbst verursacht keinen Schaden.
- Beim Kollaps 14 Grundschaden, Seltenheitsstufen multiplizieren nur den Schaden.
  Der Treffer erfolgt **1,4 s nach dem Loslassen**, genau einmal pro erreichbarem Ziel.
  Keine zweite Trefferberechnung während der anschließenden 0,65 s Ausblendung.
  Der Besitzer wird weder gezogen noch getroffen. Zerstörbare Gegenstände
  werden nicht angesaugt.
- Angriffs-Cooldown: 2,8 s, separat von der bestehenden Rolle (2,5 s).
  Der Cooldown beginnt beim Loslassen. Escape/Pause, Rolle und Waffenwechsel
  brechen das Zielen ab, ohne einen Zauber auszulösen.

## Darstellung

- Ein klarer Runenrand kündigt den tatsächlichen Wirkungsbereich an.
- Während des Sogs krümmen sich mehrere Spiralströme vom Boden zu einem
  schwebenden dunklen Kern. Zwei geneigte Umlaufbahnen zeigen dessen Rotation.
- 28 wiederverwendete Trümmer mit Lichtspuren werden angehoben und nach innen gezogen.
- Beim Kollaps verschwinden Kern und Wirbel; eine räumliche Druckwelle und ein
  sich ausbreitender Bodenring machen den einmaligen Treffer sichtbar. Trümmer
  werden kurz nach außen geschleudert und blenden aus.
- Vorwarnung, Sog, Kollaps und Abklingen laufen über dieselbe Simulationszeit.
  Pause friert sie ein, Sichtprüfung und Tiefentest verbergen verdeckte Effekte.
- Höchstens neun Zeichenschritte für das aktive Feld, ohne neue Texturen,
  dynamische Lichtquellen oder Bildschirm-Postprocessing-Effekte.

## Prüfweg
1. npm test, npm run verify:assets, npm run map:check, npm run build.
   `NEBELJAGD_URL=http://127.0.0.1:4176 python tests/gravity_staff_smoke.py`
   prüft Maus und Touch am erzeugten Spiel und erfasst die vier sichtbaren Phasen.
2. Im Editor den neuen Stab neben Übungsgegnern platzieren, **Spielen** öffnen,
   aufnehmen, Ziel markieren und drei Phasen ansehen: Warnkreis, Sog, Explosion.
3. Den Angriff mit Rolle, Hindernissen, Waffenwechsel und Neustart prüfen.
4. In der Offline-Ausgabe welt/map-editor.html / welt/magebrawl.html testen.

Status: Entwicklungsstand. Zahlen, Animation und Materialwirkung werden beim
gemeinsamen Feinschliff angepasst. CI-/Browser-Prüfungen sind erst nach
erfolgreichem Lauf als bestanden anzusehen.

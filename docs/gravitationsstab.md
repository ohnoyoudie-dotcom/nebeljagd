# Gravitationsstab – erster spielbarer Entwurf

Der neue Stab verwendet das bereits hochgeladene Original
assets/inbox/fantasy staff 3d model.glb (ca. 65 MB).
Die Originaldatei bleibt unverändert. Der CI-Build bereitet über
scripts/prepare-gravity-staff.py eine kleine, offline ladbare GLB-Kopie vor
(assets/imported/tripo-gravity-staff/runtime/gravity-staff.glb).

## Bedienung und Kampfwirkung
- Im Editor unter **Objekte → Einzeln → Gravitationsstab · Tripo** auswählen
  und wie andere Waffen platzieren. Die Projektkarte wird nicht automatisch bearbeitet.
- Unbewaffnet die Waffe aufnehmen oder mit **E** wechseln.
- **F / Angriff halten**, den violetten Kreis über den Boden bewegen, **loslassen**.
- Reichweite 10 m; Zielkreisradius 2,2 m; Vorwarnung 0,4 s.
- Anschließend 1,0 s leichter Sog, höchstens 1,5 m Gesamtverschiebung pro Gegner.
  Keine Bewegung durch geschlossene Hindernisse; der Gegner kann dagegenlaufen
  bzw. durch rechtzeitige Rolle entkommen. Sog selbst verursacht keinen Schaden.
- Beim Kollaps 14 Grundschaden, Seltenheitsstufen multiplizieren nur den Schaden.
  Keine zweite Trefferberechnung beim Abklingen.
- Angriffs-Cooldown: 2,8 s, separat von der bestehenden Rolle (2,5 s).
- Keine dynamischen Lichtquellen oder Bildschirm-Postprocessing-Effekte.

## Prüfweg
1. npm test, npm run verify:assets, npm run map:check, npm run build.
2. Im Editor den neuen Stab neben Übungsgegnern platzieren, **Spielen** öffnen,
   aufnehmen, Ziel markieren und drei Phasen ansehen: Warnkreis, Sog, Explosion.
3. Den Angriff mit Rolle, Hindernissen, Waffenwechsel und Neustart prüfen.
4. In der Offline-Ausgabe welt/map-editor.html / welt/magebrawl.html testen.

Status: Entwicklungsstand. Zahlen, Animation und Materialwirkung werden beim
gemeinsamen Feinschliff angepasst. CI-/Browser-Prüfungen sind erst nach
erfolgreichem Lauf als bestanden anzusehen.

# Schwert und zwei Zauberstäbe

Die drei hochgeladenen Modelle werden im Editor als neue, einzeln platzierbare
Waffen angeboten:

| Auswahl | Modell | Gespeicherte Variante |
| --- | --- | --- |
| Schwert | Fantasieschwert | `kit-tripo-sword` |
| Eisstab | Kristallstab | `kit-tripo-ice-staff` |
| Feuerstab | Lavakristallstab | `kit-tripo-fire-staff` |

Im aktuellen Editor unter **Objekte → Einzeln** die Waffenart und das Modell
wählen, auf die Karte setzen und bei Bedarf Seltenheit, Position, Drehung oder
Größe ändern. **Spielen** übernimmt den Entwurf. Waffen lassen sich im Spiel
aufheben; **E** nimmt eine erreichbare Waffe auf oder wechselt sie, **F** greift
an. Die Modellvariante bleibt beim Aufheben erhalten. JSON-Export und -Import
sichern diese Auswahl zusammen mit den Objekteigenschaften. Die Kartenbereinigung
behält diese drei freigegebenen Waffen. Bestehende Karten und ältere Waffenmodelle
bleiben lesbar; die Projektkarte wird nicht automatisch mit neuen Waffen bestückt.

## Halten und Bewegung

Jedes Spielmodell besitzt einen gemessenen Griff im Ursprung und eine eigene
Spitzenposition. Die vorbereiteten Modelle sind in Metern skaliert; ihre lokale
Y-Achse zeigt entlang von Klinge beziehungsweise Stab. Die Griffposition folgt
der tatsächlichen rechten Hand des animierten Avatars. Die bestehende Arm-IK
führt Ober- und Unterarm zum Handziel, während die Laufanimation weiterläuft.

Der Schwertangriff durchläuft Ausholen, Schlag und Rückführung. Die Zauberstäbe
verwenden Kanalisieren, Auslösen und Erholen; Geschosse starten an der jeweiligen
Modellspitze. Rollen unterbricht Angriffe und blendet die gehaltene Waffe während
der Rolle aus. Diese Bewegungen werden zur Laufzeit berechnet; zusätzliche
Animationsclips sind nicht in die unveränderte Charakterdatei eingebrannt.
Die erste Fassung verwendet die vorhandene Fingerhaltung. Eine individuell
geschlossene Fingerpose und weitere Schlagkombinationen sind mögliche spätere
Verfeinerungen, keine bereits neu aufgenommenen Animationen.

## Quelldateien und Browserfassungen

Die Originale bleiben unverändert in `assets/inbox/`. Sie enthalten jeweils
ungefähr zwei Millionen Dreiecke und eignen sich nicht für viele gleichzeitig
sichtbare Waffen im Browser. Reduzierte Modelle, Vergleichsansichten und
Prüfsummen liegen unter `assets/imported/tripo-weapons/`. Die reproduzierbare
Aufbereitung steht in `scripts/prepare-tripo-weapons.py`; gemeinsame Modell-
und Griffdaten in `src/map/tripo-weapon-definitions.js`.

Die drei Browserfassungen benötigen zusammen 5,57 MB und 39.975 Dreiecke.
Jedes Modell behält drei eingebettete PBR-Texturen mit 1024 × 1024 Pixeln.

Es wurde kein kostenpflichtiger Generierungsauftrag ausgelöst. Herkunft ist der
Upload des Projektinhabers; daraus wird keine zusätzliche Anbieter- oder
Lizenzbescheinigung abgeleitet.

## Prüfungen und erzeugte Dateien

- `npm test` prüft unter anderem Modellinstanzen, Variantenwechsel, Griffe,
  Spitzen, Angriffe, Abbruch, Materialtrennung und JSON-/Katalogverträglichkeit.
- `npm run verify:assets` prüft Original-Prüfsummen und geschlossene Dateilisten
  der vorbereiteten Modellpakete.
- `tests/tripo_weapons_smoke.py` prüft die echten Editoraktionen, Vorschaubilder,
  Export/Import, Übergabe ins Spiel, Aufheben und Angriffe. Sein aktueller Bericht
  und Bildschirmaufnahmen liegen nach dem Lauf in `test-results/tripo-weapons/`.
- `npm run build` erzeugt `dist/`. Die für direktes Öffnen vorgesehenen Dateien
  unter `welt/` werden aus diesem geprüften Build aktualisiert. Ein lokaler Build
  veröffentlicht nichts auf GitHub und ändert `main` nicht.

Die Browserprüfungen verwenden Chromium mit Software-WebGL. Sie belegen die
geprüften Funktionen, keine Bildrate auf einem bestimmten PC oder Tablet.

Aktueller Prüfstand: **314 Quellcode-Tests und acht Browserprüfungen der finalen
Dateien unter `welt/` bestanden**, ebenso Asset-Prüfung und Build. Bei allen
drei Waffen lag der gemessene Abstand zwischen Griff und tatsächlicher Hand bei
null; beide Zauber entstanden an der Modellspitze. Bericht samt ausgelieferten
Dateiprüfsummen: [tripo-weapons-check.json](tripo-weapons-check.json).

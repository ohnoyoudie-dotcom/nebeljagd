# Drei Wohnhäuser – Bildvorlagen für Tripo

Die aktuellen Vorlagen sind jeweils die Datei `reference.png`:

| Haus | Bild | Aufbau | Größenrichtwert |
| --- | --- | --- | --- |
| Fachwerk-Wohnhaus | [Vorlage](house-timber-family/reference.png) | Großer Wohn-/Essbereich, Schlafbereich mit zwei Betten, offene Küche; cremefarbenes Fachwerk und rote Textilien | ca. 22 × 18 m |
| Kräuter-Wohnhaus | [Vorlage](house-herbalist/reference.png) | Rechteckiger Grundriss, Wohnbereich, Schlafraum und Kräuterküche; grüne Textilien | ca. 22 × 18 m |
| Stein-Wohnhaus | [Vorlage](house-stone-merchant/reference.png) | Wohn-/Essbereich, Schlafzimmer und Küche mit Schreibplatz; Steinwände und blaue Textilien | ca. 22 × 18 m |

Maßstabsvorbild ist die im Spiel vorhandene Tripo-Taverne mit ungefähr
22 × 17,77 m. Ziel: eingeschossig, dachlos, Außenwände etwa 4,2 m hoch,
lichte Durchgänge etwa 2,8–3,2 m. Die Bilder legen keine echten Meter fest;
das spätere GLB wird neben dem Avatar auf den richtigen Maßstab eingestellt.

Alle drei Häuser haben als Formvorgabe eine geschlossene rechteckige Grundfläche
von etwa 22 × 18 m. Gegenüberliegende Außenwände sollen jeweils gleich lang sein;
Einsprünge, ausgesparte Ecken und versetzte Gebäudeflügel sind nicht vorgesehen.
Die zentrierte, steile Draufsicht macht die gegenüberliegenden Seiten besser
vergleichbar. Eine leichte perspektivische Verkürzung bleibt in den Bildern
erkennbar; sie sind keine exakt orthografischen oder maßhaltigen 3D-Grundrisse.

Jede Vorlage zeigt ein vollständiges Gebäude allein auf neutralem Hintergrund,
in derselben Materialfamilie wie Taverne und aktueller Avatar. Drei große
Wohnbereiche sind durch teilweise offene Trennwände gegliedert. Die zuletzt
überarbeiteten Fassungen enthalten sichtbar breite innere Durchgänge und
jeweils zwei äußere Zugänge. Es handelt sich nicht um maßhaltige Baupläne.

## Verwendung in Tripo

Pro Generierung nur **eine** der drei aktuellen PNG-Dateien hochladen.
Keine Zusammenstellung mehrerer Häuser oder frühere Zwischenfassung verwenden.
Als ergänzende Beschreibung eignet sich:

> Single-storey roofless fantasy residential building matching the supplied
> image. Keep a simple rectangular footprint with equally long opposite walls,
> no recessed corners or offset wings. Preserve the entire continuous floor,
> upright walls, furniture and all clearly open interior and exterior doorways.
> Keep wide unobstructed walking routes between all three living areas.
> No roof, ceiling, upper floor,
> closed doors, barriers across openings, landscape or display plinth. Clean
> timber and stone construction, separate readable furniture shapes, matte
> materials. Fire effects are not solid geometry.

Das Ergebnis als ursprüngliches GLB mit eingebetteten Texturen aufbewahren.
Vor dem Spieleinbau sind Türen, zusammenhängende Böden, Größenverhältnisse,
Möbelgeometrie und Kollisionen zu prüfen. Ein Referenzbild garantiert diese
Eigenschaften im generierten Modell nicht. Feuer und Kerzenlicht werden bei
der späteren Aufbereitung als Spieleffekte behandelt.

## Herkunft und Prüfung

- Erzeugt mit OpenAI ImageGen; Architekturvorbild:
  `assets/concepts/inn/inn-reference.png`, Stilvorbild:
  `assets/characters/player-portrait.png`.
- Originalprompts sowie gezielte Durchgangs- und Grundrisskorrekturen liegen
  beim jeweiligen Haus. `provenance.json` enthält Revisionen und SHA-256-Prüfsummen.
- Die Vorlagen sind PNG-Dateien; Originaldateien bleiben unter
  `/workspace/generated_images/` erhalten. Nur die endgültigen Bilder werden
  in diesem Konzeptordner versioniert.
- Geprüft: Bilddateien, Abmessungen, Prüfsummen sowie sichtbare Form,
  Materialkonsistenz und Raumverbindungen. Kein Tripo-Auftrag wurde ausgeführt.
- Es wurden noch keine GLBs erzeugt und keine Editor- oder Spieleinträge geändert.

Der lokale `game-dev`-CLI war nicht installiert. Diese Dokumentation ist eine
Projektablage für 2D-Konzepte und kein Studio-Admission-Receipt für fertige 3D-Assets.

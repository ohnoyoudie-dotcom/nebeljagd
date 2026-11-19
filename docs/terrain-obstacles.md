# Gemalte Geländehindernisse und ausgesparte Runenmauer

Im Editor unter **Malen → Hindernisse**: „Felsrücken malen“ ziehen, Material
(Auto/Wald/Schnee/Wüste/Sumpf), Radius 2–40 m und Höhe 2–10 m wählen.
„Durchgang radieren“ schneidet nur Hindernisse aus. Jeder Strich ist ein
Rückgängig-Schritt; Escape verwirft die laufende Geste. Maus und Touch nutzen
dieselbe Pointer-Eingabe. Vorhandene Projektobjekte bleiben unverändert.

`landscape.obstacles` ist eine optionale geordnete Liste aus Kapselstrichen.
Ein Strich speichert `id`, `points`, `radius`, `height`, `biome`, `erase`.
Übermalen vereinigt Flächen; Radieren subtrahiert sie; erneutes Malen füllt
sie wieder. JSON, Browserentwurf, Editor-HTML und SVG-Metadaten erhalten diese
Daten. Alte Karten erhalten das Feld erst nach Benutzung des Pinsels.

Ein gemeinsames Dreiecksraster mit 1,5 m Abtastung erzeugt die verbundenen
Kappen und Außenkanten. Küsten und Wasser werden ausgespart. Ein räumlicher
Index begrenzt die Abtastkosten; Geometrie wird pro 64-m-Abschnitt gebündelt.
Es gibt höchstens 512 Striche mit je 512 Punkten und ein Flächenbudget.
Erhabene Kanten, geschichteter Fels, eingelagertes Gestein und Biomkappen
verwenden lokale Geometrie und prozedurale Materialien, keine neuen Downloads.
Die Minikarte und die Startübersicht zeigen die gespeicherten Hindernisse.
Die Kappen sind nicht begehbar. Bewegung, direkte Geschosse und Sicht werden
blockiert; hohe Geschosse können entsprechend ihrer tatsächlichen Höhe
über einen Felsrücken fliegen. Radierte Durchgänge sind wirklich frei.

Die Runenmauer prüft ihre eigene Grundfläche statt die Sichtlinie vom Zauberer.
Nicht belegte Streifen werden zu Teilmauern verbunden. Bäume, Gebäude, andere
Mauern, Wasser und anwesende Figuren sparen nur die betroffene Stelle aus.
Die Prüfung erfolgt beim Zielen und unmittelbar vor dem Erstarren nochmals.
Alle Teile teilen Lebenspunkte und Lebensdauer. Vorschau, Auflösen und echte
Kollision verwenden dieselben Abschnitte. Winzige Reststücke unter 1,1 m
werden ausgelassen; vollständig belegte Ziele lösen keinen Zauber aus.

Prüfung: `npm test`; `npm run build`; anschließend bei lokal bereitgestelltem
`welt/`: `NEBELJAGD_URL=http://127.0.0.1:5441 python3 tests/terrain_obstacles_smoke.py`.
Die Browserprüfung verwendet isolierte Testentwürfe und verändert die
veröffentlichte `worldmap.json` nicht. CPU-Rendering in Chromium ist keine
Aussage zur Bildrate auf einem physischen iPad.

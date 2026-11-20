# Gemalte Geländehindernisse und ausgesparte Runenmauer

Im Editor unter **Malen → Hindernisse**: „Felsrücken malen“ ziehen, Material
(Auto/Wald/Schnee/Wüste/Sumpf), Radius 2–40 m und Höhe 2–10 m wählen.
Als Hindernisart stehen Felsrücken oder **Dichter Wald** zur Wahl. Der Wald
verwendet den vorhandenen eigenen Baum sowie Tripo-Felsen, mit wechselnder
Größe, Rotation und Biomfarbe. Bäume werden aus der Fläche abgeleitet und
nicht als Tausende unverbundene Objekte im Kartendokument gespeichert.
„Durchgang radieren“ schneidet nur Hindernisse aus. Jeder Strich ist ein
Rückgängig-Schritt; Escape verwirft die laufende Geste. Maus und Touch nutzen
dieselbe Pointer-Eingabe. Vorhandene Projektobjekte bleiben unverändert.

`landscape.obstacles` ist eine optionale geordnete Liste aus Kapselstrichen.
Ein Strich speichert `id`, `points`, `radius`, `height`, `biome`, `erase` und optional `style` (cliff/forest).
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

## Waldboden

Eine dezente gekachelte Graszeichnung verändert nur die grünen Bodenmaterialien.
Sie besteht aus kleinen, unregelmäßigen Pinselstrichen und benötigt weder
zusätzliche Grasgeometrie noch Windanimation. Sand, Schnee und Stein bleiben
frei von grünen Grashalmen.

Pilze und kleine helle/violette Blüten entstehen deterministisch in lockeren
Gruppen nahe vorhandener Bäume, auch am Rand gemalter dichter Wälder. Wasser,
Wege, Hauseingänge und gepflasterte Bodenflächen werden ausgespart. Die kleinen
Objekte sind dekorativ und ändern keine Kollision oder Beute. Im Hindernispanel
kann „Blumen, Pilze und kleine Steine auf Grünflächen“ abgeschaltet werden; die optionale
Einstellung `landscape.woodlandDetails` bleibt beim Speichern erhalten. Die
Dekoration ist standardmäßig aktiv, ohne die bestehende Projektkarte umzuschreiben.
Instanzgruppen werden nur in der Umgebung gerendert und aus der Fernansicht
weggelassen. Dichte gemalte Waldflächen sind auf insgesamt 40.000 m² begrenzt.

## Höhenprofil und Sicht auf die eigene Figur

„Grundhöhe“ steuert die mittlere Höhe. Breite, weltverankerte Erhebungen und
Senken variieren diese Höhe um höchstens etwa 44 Prozent. Das Profil ist nach
Neuladen, Export und in angrenzenden Pinselstrichen identisch. Geometrie,
Projektilprüfung und Objektaufstellung verwenden dieselbe abgetastete Höhe.
Auch dichter Wald steht auf erhöhtem Terrain. Felsplateaus erhalten passende
Bäume und Unterholz; manuell gesetzte Objekte stehen ebenfalls auf der Kappe.
Die Kappe bleibt für Spielfiguren gesperrt, auch beim Teleportieren.

Direkt zwischen Kamera und eigener Figur wird eine kleine weich auslaufende
Sichtöffnung in verdeckenden Felsflächen und Objekten (auch Stämmen) ausgespart. Außerhalb der Öffnung bleibt
der Fels unverändert. Baumkronen berücksichtigen zusätzlich die Kamerasichtlinie
und ihre tatsächliche Höhe, auch auf einem Plateau. Das verändert weder
Kollision noch die taktische Sicht auf andere Figuren. Wasser und Küstenform
bleiben unverändert.

Zusätzliche Browserprüfung: `python3 tests/terrain_relief_smoke.py` gegen die
fertig gebauten Dateien, mit Bildern von vorn, hinter und seitlich am Felsen.

## Gemalte Grasbüschel

Begehbarer grüner Boden und die flachen Oberseiten der Felsplateaus verwenden
dieselbe gekachelte Graszeichnung. Kleine Fächer aus spitz zulaufenden Halmen
variieren in Größe und Richtung. Zwei gedrehte Maßstäbe brechen Wiederholungen
auf. Das frühere regelmäßige Halmenraster auf den Plateaus entfällt vollständig.
Die Zeichnung verändert nur die Farbe: keine Rillen oder zusätzliche Höhen.
Steile Felswände, Sand und Schnee erhalten keine grünen Grasbüschel.

Offene grüne Rasenflächen erhalten ebenfalls wenige lockere Gruppen, auch ohne
Bäume. Pro unregelmäßig versetztem 12-m-Bereich bleibt die Platzierung häufig
ganz aus. Blumen überwiegen, Pilze sind vor allem im Wald und Sumpf häufiger.
Einzelne flache Kiesel ergänzen die Gruppen; sie sind rein dekorativ. Alle Details
meiden Wege, Wasser, Gebäude und die unmittelbaren Kanten erhöhter Plateaus.

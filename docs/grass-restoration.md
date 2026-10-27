# Wiedergefundenes Versteckgras

Das ältere dichte Gras ist erhalten. Die bearbeitbare Quelle liegt unverändert
als `src/world.js` in `archive/nebeljagd-3d-v011-source.zip`; derselbe Stand ist
in `public/versions/nebeljagd-3d-v011.html` spielbar gesichert. Der spätere
Walddorfstand v012 und `docs/screenshots/grass-concealment.png` zeigen ebenfalls
die frühere, deutlich geschlossenere Graswirkung. Keine Archivdatei wurde
überschrieben.

## Nachvollziehbarer Unterschied

Im v011-Archiv stehen sechs Grasflächen mit nominell zusammen rund 329 m².
Darauf wurden 10.000 gekreuzte Halme in der Leistungsstufe bzw. 19.000 in der
hohen Stufe verteilt: etwa 30 bzw. 58 Kreuzhalme/m², vor Rand-/Hinderniskorrektur.
Eine Halmfläche war am Fuß 0,28 Einheiten breit und bestand aus vier vertikalen
Abschnitten. Farbverlauf und Farbvariation gaben ihr einen dunkleren Fuß und
hellere Spitzen. Das hohe Gras wich auch dort nicht vor der Figur zurück.

Die große Insel verwendete dagegen etwa 8,8 schmale Kreuzhalme/m² und eine
Basisbreite von 0,18. Die zuletzt erhöhte Halmhöhe allein konnte die dadurch
entstandenen Lücken nicht schließen. Die alte Welt war tatsächlich dichter;
ihre Halme waren wegen der anderen Welt-/Figurenskalierung nicht in allen
Ständen numerisch höher. Die Wiederherstellung senkt daher die heutige Höhe
nicht wieder ab.

## Wiederherstellung in der aktuellen Karte

`src/hiding-grass.js` übernimmt die breite gekreuzte Halmform und die vier
Höhenabschnitte der Archivquelle. Vier kleine versetzte, verschieden gerichtete
Halme bilden nun eine instanzierte Gruppe. Das ergibt rund 35,4 Kreuzhalme/m²
bei unveränderter Zahl der Insel-Instanzmatrizen. Die bestehenden Flächen,
Drehungen, Radien und Versteckregeln in `worldmap.json` bleiben erhalten.

Die Höhe bleibt 2,25–2,60 Meter bei Skalierung 1. Der neue Referenzlook wird mit
einer grünen Basis und helleren gelbgrünen Spitzen aufgegriffen. Kleine
Richtungs- und Farbvariationen und die leichte Krümmung lassen die Fläche wie
ein dichtes Grasbüschel wirken. Die Halme reagieren weiterhin nur auf Wind;
sie werden beim Betreten nicht zur Seite gedrückt. Lokaler Kopf-/Schulterrest
und Lebensbalken bleiben lesbar; fremde Figuren sind in der Versteckfläche
weiterhin vollständig verborgen.

## Begrenzte Kosten

Die große Insel behält ungefähr 239.693 hohe Grasinstanzen statt deren Zahl zu
vervierfachen. Jede enthält vier Halmkreuze. Gras wird in 16-Meter-Teilgruppen
abgelegt und nur in 34 Metern Nähe (Leistung) bzw. 48 Metern Nähe (Detailreich)
gezeichnet. Ab 24 Metern oder in der Leistungsstufe haben dieselben Halme nur
zwei statt vier Höhenabschnitte. Ihre Höhe, Breite und Anzahl bleiben dabei
gleich; die Dreieckszahl halbiert sich. So wird ein Versteck in der
Leistungsstufe nicht wieder löchrig.

Drei CPU-Tests prüfen echte Dichte/Geometrie, Farbverlauf, identische niedrige
Silhouette bei halben Dreieckskosten und lokale Detailausblendung. Der
Browserbericht `grass-restoration-check.json` prüft die Startfläche bei
`[10,-30]` in beiden Qualitätsstufen einschließlich Verbergungsstatus. Die
Messwerte stammen aus Software-WebGL, nicht aus einem physischen Schul-iPad.

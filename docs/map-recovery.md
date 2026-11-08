# Wiederhergestellte Benutzerkarte · 8. November 2026

Der Benutzercommit `53b2a4e` speicherte die bearbeitete Karte ausschließlich in
`welt/worldmap.json`. Die Quelldatei im Projektstamm enthielt weiterhin nur sechs
Objekte. Beim automatischen Build wurde die bearbeitete Ausgabekopie daher durch
die ältere Projektquelle ersetzt. Der Commit blieb im Git-Verlauf erhalten.

Die Karte aus `53b2a4e:welt/worldmap.json` wurde unverändert als maßgebliche
`worldmap.json` im Hauptordner übernommen:

- SHA-256: `a9dc2cc720d48eb1d3b1a56319c11ba6f0ca6183b131a9cad76eda14ad1f12b3`.
- 31 Objekte einschließlich 13 Bäumen, sechs Grasflächen, Karren, Fass,
  Brunnen, Truhe und verziertem Bogen.
- 86 Bodenstempel und elf gemalte Biomflächen.
- Objekt-IDs, Positionen, Drehungen, Größen und Landschaftseinstellungen aus
  der Benutzerkarte bleiben erhalten. Die Küste, vier Regionen und zwei Wege
  entsprechen weiterhin der bisherigen Projektkarte.

`worldmap.svg` wird aus dieser Quelle neu exportiert. Der Browser-Build erzeugt
Editor, Spiel und `welt/worldmap.json` gemeinsam aus derselben Karte.

Künftige Editor-Exporte gehören als `worldmap.json` in den **Projektstamm**.
`welt/` enthält die automatisch erzeugte Ausgabe. Eine mögliche spätere
Umstellung auf `maps/worldmap.json` muss die Lade- und Build-Pfade gemeinsam
ändern; diese Wiederherstellung ändert die Verzeichnisstruktur nicht.

Die Stashes auf dem Windows-Rechner gehören zur dortigen Sicherung. Insbesondere
liegt das noch nicht versionierte `green abstract 3d model.glb` im Rettungs-Stash;
es ist nicht Bestandteil dieser Kartenwiederherstellung. Alte Codeänderungen
aus diesem Stash sollten bei der gezielten Modellwiederherstellung nicht mit
übernommen werden.

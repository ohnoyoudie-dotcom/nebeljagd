# Ruhiges Inselwasser

Der gespeicherte Kartenrand verwendet Wasser. Umrisse, Biome, Wege, Objekte und
Kollisionen bleiben unverändert. Der Abgrund bleibt für andere Karten auswählbar.

Das Meer verwendet eine ebene Fläche mit zwei Dreiecken. Drei langsame,
überlagerte Wellenfunktionen verändern nur die Farbe. Bildschirmableitungen
blenden feine Muster bei großer Entfernung aus. Es gibt keine Spiegelungs- oder
Brechungsdurchgänge, zusätzlichen Texturen, Partikel oder animierte Geometrie.
Die Küsten aller Inseln und Binnengewässer teilen sich je ein Uferband und ein
abfallendes Ufer. Der breite Flachwassersaum zeichnet nur einmal, ohne
Tiefenschreiben. Alle Wasseranimationen verwenden die vorhandene Weltzeit.

Die Umsetzung ist für einen kleinen Renderaufwand ausgelegt. Browserprüfungen
mit Tablet-Abmessungen ersetzen keine Leistungsprüfung auf einem echten iPad.

Die Küste fällt nun über etwa 1–2 Meter zum Wasser ab. Ein etwa 8–10 Meter
breiter, weich auslaufender Farbverlauf stellt zunehmende Wassertiefe dar. An
engen Gewässern wird er vor dem gegenüberliegenden Ufer gekürzt. Die Landfarbe
setzt sich am oberen Rand fort; es gibt keine helle durchgehende Schaumlinie.
Der begehbare Inselumriss wird nicht erweitert.
Das trockene Ufer verwendet dieselbe Bodentextur wie die Insel, ohne eine
weitere Textur zu laden. Seine Breite variiert leicht entlang der Küste.

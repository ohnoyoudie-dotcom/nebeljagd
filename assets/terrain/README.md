# Gelände und Oberflächen

`src/terrain-art.js` malt die Albedo lokal und deterministisch auf Canvas:
mehrere Rauschskalen für Erde/Wiese, weiche Wegschultern, feuchte Bachufer,
Laubhumus unter Bäumen, gestaffelte Pflastersteine an Hauseingängen und feine
Mineral-/Laubstreuung. Eine wiederholte Relieftextur liefert Mikrostruktur für
die Standard-PBR-Beleuchtung. Es gibt keine heruntergeladenen Fotos/Texturen.

`src/world.js` erzeugt das Gelände samt sanften Höhenunterschieden. Dieselbe
Höhenfunktion setzt Figur, Bäume, Felsen und Gras auf die Oberfläche. Wege,
Flussnähe und Hausgrundrisse bleiben für spielbare Durchgänge abgeflacht.

Die Materialien sind eigene prozedurale Projektquellen, keine exportierten
Blender-PBR-Pakete. Weitere handgemalte Übergänge und spezifische geologische
Formen können darauf aufbauen. Die Landschaft ist ein ausgearbeiteter
Prototypbereich und noch keine fertig produzierte Sammlung sämtlicher Biome.

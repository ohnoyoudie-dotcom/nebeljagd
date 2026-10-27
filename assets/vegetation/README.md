# Vegetation · eigenständige Quellen

`src/vegetation.js` erzeugt drei eigene Baumarten: Eiche, Birke und Waldkiefer.
Die Texturen für Borke, Birkenrinde, Blattzweige und Kiefernnadeln werden lokal
auf Canvas gezeichnet. Keine Fotos, fremden Spielmodelle oder externen Assets
sind enthalten. Die Formen und Texturen sind für Nebeljagd erstellt.

Jeder Baum besitzt räumliche, zusammengeführte Astgeometrie sowie individuell in
3D orientierte, leicht gewölbte Blattzweige mit Alpha-Test. Die Kronen bestehen
nicht aus kameragewandten Baum-Billboards oder geometrischen Kugeln. Kiefern
haben sieben verzweigte Astkränze statt Kegelkronen. Skalierung, Drehung, Krone
und Farbton variieren; einzelne Laubbäume besitzen zurückhaltende Herbsttöne.

Pro Baumart werden Stamm/Äste sowie Nah- und Fernlaub instanziert. Das ergibt
höchstens neun Basis-Draw-Calls für alle Bäume. Hysterese und ein Updateintervall
von 0,5 Sekunden begrenzen LOD-Verwaltung; in der Leistungsstufe werden mehr
Fernkronen und keine Fernlaubschatten verwendet. Die Kronen lösen sich in
Spielernähe per Alpha-Dithering etwas auf, damit sie die Figur nicht verdecken.

Abmessungen vor Platzierungsskalierung: Stammradius höchstens 0,34;
Kronenradius ungefähr 2,3–3,1; Gesamthöhe ungefähr 5,8–7,2. Das vorhandene
Stamm-Kollisionsmodell kann beibehalten werden. Die weichen Kronen sind keine
festen Hindernisse. Dieses Modul ist eine eigene prozedurale Asset-Quelle;
eine separate manuell verfeinerte Blender-Bibliothek bleibt ein späterer
Produktionsschritt.

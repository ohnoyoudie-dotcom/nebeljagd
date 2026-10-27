import { readFile, writeFile } from 'node:fs/promises';
import { crc32, deflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';

/** A small deterministic ZIP, using only Node's built-in modules. */
export async function packageWorldBundle(directory = resolve('dist')) {
  const names = ['nebeljagd.html', 'map-editor.html', 'worldmap.json', 'worldmap.svg', 'worldmap.schema.json'];
  const entries = await Promise.all(names.map(async name => ({ name, bytes: await readFile(resolve(directory, name)) })));
  entries.push({ name: 'Anleitung.txt', bytes: Buffer.from(`NEBELJAGD – SPIELWELT UND EDITOR

1. Dieses ZIP vollständig in einen Ordner entpacken.
2. nebeljagd.html im Browser öffnen: die große Insel erkunden.
3. map-editor.html im Browser öffnen: Weltobjekte anlegen und verändern.
4. Im Editor „In 3D testen“ öffnet deinen aktuellen Entwurf im Spiel.
   Beide HTML-Dateien müssen dafür im selben Ordner liegen.

Bäume, Häuser, Blumen, Gras und andere Weltobjekte lassen sich auswählen,
verschieben, drehen, vergrößern, duplizieren und löschen. Mit „Auf Karte
zeigen“ vergrößerst du ein ausgewähltes Objekt. Gras und Blumen sind
gemeinsam verschiebbare Flächen, keine einzeln bearbeitbaren Halme.

„Graspinsel“ malt hohes, dichtes Versteckgras. „Radiergummi“ entfernt beim
Ziehen über die Mittelpunkte ganze Objekte; wähle „Alle Objekte“ oder
„Nur Grasflächen“ und den gewünschten Radius. Ein Strich lässt sich mit
einem Rückgängig-Schritt zurücknehmen. Küste, Regionen und Wege bleiben erhalten.
„Bewachsene Erhöhung“ bietet Felskanten und Felskuppen als feste Hindernisse.
Du kannst sie verschieben, drehen und skalieren; im Spiel blockieren sie
Bewegung, Pfeile und die Sicht auf Figuren dahinter.
Zehn Holzkisten sind auf der Insel verteilt. Sie halten mehreren Treffern stand;
nach der Zerstörung verschwindet ihre Kollision, und der freie Weg wird sichtbar.
Bei einem Neustart der Runde sind die Kisten wieder da.

Die sechs Editorbereiche Gelände, Vegetation, Objekte, Wind und Umgebung,
Biome sowie Karte und Vorschau enthalten die Landschaftswerkzeuge:
- Vegetationstyp, Höhe, Dichte, Farb- und Bodenanpassung wählen und malen.
- Bereits gesetzte Flächen auswählen und rechts bearbeiten.
- Bodenarten mit weichem oder hartem Rand malen und wieder radieren.
- Objekte mit Abstand und zufälliger Größe in natürlichen Gruppen verteilen.
- Wind und lokale Windzonen einstellen; die Live-Vorschau zeigt das Gras.
- Biome aufmalen und eigene Einstellungen als Vorlage mit der Karte speichern.
Ein Pinselstrich entspricht einem Rückgängig-Schritt; Esc verwirft den
angefangenen Strich. Änderungen als JSON oder als Editor-HTML sichern.

„JSON speichern“ sichert deinen Entwurf als weiterverwendbare Datei.
Im Spiel kannst du diese Datei über „Eigene Karte laden“ öffnen.
Die Editoränderungen verändern die mitgelieferte worldmap.json nicht.
SVG ist eine zusätzliche Grafik; Änderungen darin ändern JSON nicht.

Das Spiel ist ein Einzelspieler-Erkundungsprototyp. Die Weltgröße und
Startbereiche sind für später etwa 50 Spieler vorbereitet; Multiplayer
und Teams sind noch nicht implementiert.
`, 'utf8') });
  const files = [], central = []; let offset = 0;
  for (const entry of entries) {
    const filename = Buffer.from(entry.name), compressed = deflateRawSync(entry.bytes), checksum = crc32(entry.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(0x21, 12); header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(entry.bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    files.push(header, filename, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8); record.writeUInt16LE(8, 10); record.writeUInt16LE(0x21, 14);
    record.writeUInt32LE(checksum, 16); record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(entry.bytes.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, filename); offset += header.length + filename.length + compressed.length;
  }
  const end = Buffer.alloc(22), directoryBytes = Buffer.concat(central);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12); end.writeUInt32LE(offset, 16);
  await writeFile(resolve(directory, 'nebeljagd-welt-und-editor.zip'), Buffer.concat([...files, directoryBytes, end]));
  console.log('Offline bundle: dist/nebeljagd-welt-und-editor.zip');
}

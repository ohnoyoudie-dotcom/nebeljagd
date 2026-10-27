# Vorhandene Modelle und Kartenobjekte

Der Objektkatalog weist jeder vorhandenen Art und Variante eine explizite
Modellquelle zu. `src/map/objects.js` trägt die stabile `assetId` an jeder
Variante; `src/map/asset-catalog.js` beschreibt Quelle, Laufzeitdarstellung und
Besonderheiten. `worldmap.json` speichert weiterhin nur Objektart und Variante,
Position, Drehung, Größe und gegebenenfalls Seltenheit/Flächenradius. Ein altes
Kartendokument benötigt durch die Zuordnung keine neuen Pflichtfelder.

Der Editor zeigt die Varianten mit **Vorschaubildern der tatsächlichen Modelle**.
Diese entstehen durch den vorhandenen Three.js-Renderer in
`assets/catalog/preview.html`, nicht durch ein fremdes Grafikpaket. Die 256×192
Pixel großen WebP-Dateien werden in `assets/catalog/previews.json` eingebettet;
der Editor benötigt beim Öffnen keine Bilddownloads und lädt keine 3D-Engine
nur für die Vorschaubilder. Die Renderansicht ist eine neutrale Vorschau; Licht,
Farbe, Zufallsverteilung innerhalb eines Beetes und Gegenstandsleuchten können
in der Spielwelt anders wirken.

| Kartenobjekt / Varianten | Vorhandene Grafik | Umsetzung |
| --- | --- | --- |
| Baum: Eiche, Birke, Kiefer | `src/vegetation.js` | Drei verschiedene Baumformen mit selbst erzeugten Rinden-/Laubmaterialien |
| Baum: Rei-Laubbaum 1 | `assets/imported/rei/runtime/tree01.glb` | Gelieferte Geometrie, angepasste Laufzeitmaterialien |
| Baum: Rei-Laubbaum 2 | `assets/imported/rei/runtime/tree02.glb` | Zweite gelieferte Baumform |
| Haus: Kräuterhaus, Waldgasthaus, Jägerhaus | `src/houses.js` | Drei eingerichtete offene Holzhausvarianten |
| Blumen: Weiß, Rot, Gold | `assets/imported/rei/runtime/flowers.glb` | Drei benannte Blumenprototypen mit ursprünglichen Vertexfarben |
| Beetuntergrund | `assets/imported/rei/runtime/bed-ground.glb` | Vorhandene Bodenplane, automatisch Teil der Blumenbeete |
| Gras: hoch, niedrig | `src/world-object-renderer.js` | Instanzierte Halme; hohes Gras als Versteckfläche |
| Felsen: Granit, Basalt | `src/world-object-renderer.js`, `src/stone-art.js` | Vorhandene Felsform mit zwei Materialien |
| Bewachsene Erhöhungen: Felskante, Felskuppe | `src/overgrown-mounds.js` | Eigene gestufte Felsformen mit Moos und Pflanzen; solide Hindernisse mit passender Sicht- und Projektildeckung |
| Strauch: Rei | `assets/imported/rei/runtime/bush.glb` | Aus dem hochgeladenen Muster abgeleitete Strauchgeometrie |
| Steinruine, magischer Schrein | `src/world-object-renderer.js` | Vorhandene Spielgeometrie |
| Heilendes Herz | `src/pickups.js` | Vorhandenes Herzmodell |
| Holztruhe | `src/chests.js` | Truhe mit Holzplanken, Metallbändern und beweglichem Deckel |
| Bogen, Schwert, Feuerstab, Eisstab | `src/weapons.js` | Vier vorhandene Waffenmodelle; Farbe des Leuchtens folgt der Seltenheit |
| Gold | `src/pickups.js` | Münzen aus Truhen; kein separat platzierbarer Kartenfund |
| Waldläufer | `assets/characters/ranger.glb`, `ranger.blend` | Vorhandene animierte Spielfigur, kein Karten-Dekorationsobjekt |

## Originale und Einschränkungen

Die vier hochgeladenen Rei-Originale liegen unverändert in
`assets/imported/rei/source/`. `source-manifest.json` und `runtime-manifest.json`
belegen ihre Prüfsummen und die bisherige Ableitung. Die Originale werden für
Katalog und Vorschaubilder nicht neu bearbeitet. Es wurde keine zusätzliche
Herkunfts- oder Lizenzbehauptung eingeführt.

Die Gras-GLB enthält **keine Grashalme**, sondern eine Bodenplane und einen
Hilfswürfel. Deshalb wird sie nicht als hohes Gras angeboten. Die Baumdateien
enthalten nicht den ursprünglichen Blender-Laubshader; die vorhandene
Laufzeitdarstellung mit eigenen Materialien wird unverändert weiterverwendet.
Die Modelle werden durch diese Zuordnung nicht zu neuen Importen.

## Vorschauen neu erzeugen und prüfen

```sh
npm run dev -- --port 5190
NEBELJAGD_URL=http://127.0.0.1:5190 python3 scripts/capture-asset-previews.py
node --test tests/asset_catalog.test.js
```

Das Aufnahmeprogramm rendert jedes Modell aus dem aktuellen Spielcode und
ersetzt ausschließlich die Katalogvorschaubilder. Es benötigt lokal Playwright
und Chromium. `assets/catalog/preview-manifest.json` dokumentiert Varianten,
Dateigrößen und Prüfsummen. Nach einer Modelländerung die betroffenen Vorschauen
neu erzeugen. Neue Assets werden weiterhin gezielt nach `assets/inbox/` gelegt
und anschließend bewusst in den Katalog und den passenden Renderer eingebaut.

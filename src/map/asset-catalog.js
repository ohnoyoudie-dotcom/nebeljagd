import previews from '../../assets/catalog/previews.json' with { type: 'json' };

/** Explicit mapping to models already used by the game. Preview images are
 * captures of those models, embedded so the standalone editor stays offline.
 * This catalogue does not import arbitrary files or admit external packages. */
const project = (kind, variant, label, paths, notes, extra = {}) => ({
  id: `${kind}:${variant}`, kind, variant, label, format: 'procedural',
  sourceLabel: 'Nebeljagd · Spielmodell', sourcePaths: paths,
  renderer: paths[0], status: 'available', previewKind: 'render', notes, ...extra,
});
const rei = (kind, variant, label, runtime, source, notes, extra = {}) => ({
  id: `${kind}:${variant}`, kind, variant, label, format: 'glb',
  sourceLabel: 'Rei · vorhandenes 3D-Modell',
  sourcePaths: [`assets/imported/rei/runtime/${runtime}`, `assets/imported/rei/source/${source}`],
  renderer: 'src/world-object-renderer.js', status: 'available', previewKind: 'render', notes,
  provenance: 'assets/imported/rei/source-manifest.json', ...extra,
});
const kit = (kind, variant, label, filename, notes) => ({
  id: `${kind}:${variant}`, kind, variant, label, format: 'glb',
  sourceLabel: 'Nebeljagd Umwelt-Kit v1',
  sourcePaths: [`Blender/nebeljagd_umwelt_kit_v1/assets/${filename}.glb`],
  renderer: 'src/world-object-renderer.js', status: 'available', previewKind: 'render', notes,
  provenance: 'Blender/nebeljagd_umwelt_kit_v1/manifest.json',
});
const tripo = (kind, variant, label, filename, original, notes, packageName = 'tripo-props') => ({
  id: `${kind}:${variant}`, kind, variant, label, format: 'glb',
  sourceLabel: 'Eigener Tripo-Export · aufbereitetes Spielmodell',
  sourcePaths: [`assets/imported/${packageName}/runtime/${filename}.glb`, `assets/inbox/${original}.glb`],
  renderer: kind === 'chest' ? 'src/tripo-chest.js' : 'src/world-object-renderer.js',
  status: 'available', previewKind: 'render', notes,
  provenance: `assets/imported/${packageName}/provenance.json`,
});

export const ASSET_CATALOG = Object.freeze([
  project('tree', 'oak', 'Eiche', ['src/vegetation.js', 'src/world-object-renderer.js'], 'Breite Laubkrone und dunkler Stamm.'),
  project('tree', 'birch', 'Birke', ['src/vegetation.js', 'src/world-object-renderer.js'], 'Heller Stamm und leichte Laubkrone.'),
  project('tree', 'pine', 'Kiefer', ['src/vegetation.js', 'src/world-object-renderer.js'], 'Hoher Nadelbaum mit gestuften Ästen.'),
  rei('tree', 'rei-tree01', 'Rei-Laubbaum 1', 'tree01.glb', 'Rei_treeLeavesGN.glb', 'Hochgeladenes Baummodell mit angepassten Blatt- und Rindenfarben.'),
  rei('tree', 'rei-tree02', 'Rei-Laubbaum 2', 'tree02.glb', 'Rei_treeLeavesGN_samples.glb', 'Zweite vorhandene Baumform aus der Rei-Sammlung.'),
  project('house', 'herbal', 'Kräuterhaus', ['src/houses.js', 'src/world-object-renderer.js'], 'Offenes Holzhaus mit Einrichtung und Kräuterdetails.'),
  project('house', 'inn', 'Waldgasthaus', ['src/houses.js', 'src/world-object-renderer.js'], 'Offenes Gasthaus mit eigener Farbgebung und Einrichtung.'),
  project('house', 'hunter', 'Jägerhaus', ['src/houses.js', 'src/world-object-renderer.js'], 'Offenes Holzhaus mit Jägermotiv.'),
  rei('flower', 'rei-white', 'Rei-Blumen · Weiß', 'flowers.glb', 'Rei_flowersGN_sample.blend', 'Weiße Blüten als gemeinsam verschiebbares Beet.', { node: 'Rei_Flower_White', companion: 'assets/imported/rei/runtime/bed-ground.glb' }),
  rei('flower', 'rei-red', 'Rei-Blumen · Rot', 'flowers.glb', 'Rei_flowersGN_sample.blend', 'Rote Blüten als gemeinsam verschiebbares Beet.', { node: 'Rei_Flower_Red', companion: 'assets/imported/rei/runtime/bed-ground.glb' }),
  rei('flower', 'rei-gold', 'Rei-Blumen · Gold', 'flowers.glb', 'Rei_flowersGN_sample.blend', 'Goldgelbe Blüten als gemeinsam verschiebbares Beet.', { node: 'Rei_Flower_Gold', companion: 'assets/imported/rei/runtime/bed-ground.glb' }),
  project('grass', 'tall', 'Hohes Versteckgras', ['src/world-object-renderer.js'], 'Dichte, hohe Halme als Versteckfläche; auch mit dem Graspinsel malbar.'),
  project('grass', 'short', 'Niedriges Gras', ['src/world-object-renderer.js'], 'Niedrige Bodenvegetation ohne Sichtschutz.'),
  project('rock', 'granite', 'Granit', ['src/world-object-renderer.js', 'src/stone-art.js'], 'Heller verwitterter Felsen als feste Deckung.'),
  project('rock', 'basalt', 'Dunkler Basalt', ['src/world-object-renderer.js', 'src/stone-art.js'], 'Dunkle Variante des vorhandenen Felsenmodells.'),
  project('mound', 'ridge', 'Bewachsene Felskante', ['src/overgrown-mounds.js', 'src/world-object-renderer.js'], 'Längliche, feste Felskante mit Moos und Pflanzen; 12 × 5 Meter bei Größe 1. Blockiert Bewegung, Geschosse und Sicht.'),
  project('mound', 'knoll', 'Bewachsene Felskuppe', ['src/overgrown-mounds.js', 'src/world-object-renderer.js'], 'Kompakte, feste Erhöhung mit Moos und Pflanzen; 6 × 5 Meter bei Größe 1. Blockiert Bewegung, Geschosse und Sicht.'),
  rei('bush', 'rei-bush', 'Rei-Strauch', 'bush.glb', 'Rei_treeLeavesGN_samples.glb', 'Kompakter, begehbarer Strauch aus der Rei-Sammlung.'),
  project('ruin', 'stone', 'Steinruine', ['src/world-object-renderer.js', 'src/stone-art.js'], 'Begehbare Mauerreste mit Öffnungen und Sichtdeckung.'),
  project('shrine', 'magic', 'Magischer Schrein', ['src/world-object-renderer.js'], 'Steinsockel mit schwebender Magie; noch ohne Lernaufgabe.'),
  project('heart', 'healing', 'Heilendes Herz', ['src/pickups.js'], 'Vorhandenes Herzmodell zum Wiederherstellen von Leben.'),
  project('chest', 'wood', 'Holztruhe mit Gold und Beute', ['src/chests.js'], 'Holztruhe mit Klappdeckel; wirft Gold und Ausrüstung aus.'),
  project('bow', 'wood', 'Holzbogen', ['src/weapons.js'], 'Holzbogen mit Sehne und Pfeil; Leuchtfarbe folgt der Seltenheit.'),
  project('sword', 'steel', 'Stahlschwert', ['src/weapons.js'], 'Vorhandenes Schwertmodell; Leuchtfarbe folgt der Seltenheit.'),
  project('fireStaff', 'ember', 'Glutstab · Verbrennung', ['src/weapons.js'], 'Feuerstab mit Glutspitze; verursacht Brandschaden.'),
  project('iceStaff', 'frost', 'Froststab · Verlangsamung', ['src/weapons.js'], 'Eisstab mit Frostspitze; verlangsamt getroffene Ziele.'),
  kit('tree', 'kit-pine-high', 'Große Kiefer · GLB', 'pine_high', 'Hohe Kiefer aus dem bereits eingebundenen Nebeljagd-Umwelt-Kit.'),
  kit('tree', 'kit-pine-young', 'Junge Kiefer · GLB', 'pine_young', 'Kleine Kiefer für gemischte Baumgruppen.'),
  kit('tree', 'kit-oak-green', 'Grüne Eiche · GLB', 'oak_green', 'Grüne Eiche aus dem bestehenden Umwelt-Kit.'),
  kit('tree', 'kit-oak-autumn', 'Herbsteiche · GLB', 'oak_autumn', 'Eichenmodell mit eigenen Herbstfarben; im Herbstbiom verwendbar.'),
  kit('wall', 'kit-stone', 'Steinmauer · GLB', 'wall_stone_3m', 'Modulare Steinmauer mit ungefähr 3,2 × 0,62 Metern Grundfläche.'),
  project('wall', 'kit-cut-stone', 'Steinmauer · Pfeiler & Abdeckung', ['src/barrier-models.js', 'src/environment-kit.js'], 'Vier Meter lange Steinmauer mit gesetzten Quadern, Pfeilern und heller Abdeckung. Im Zeichenwerkzeug als zusammenhängende Strecke verwendbar.'),
  kit('fence', 'kit-wood', 'Holzzaun · GLB', 'fence_wood_3m', 'Modularer Holzzaun mit ungefähr 3,2 × 0,4 Metern Grundfläche.'),
  project('fence', 'kit-cross-wood', 'Holzzaun · Kreuzstreben', ['src/barrier-models.js', 'src/environment-kit.js'], 'Vier Meter langer Holzzaun mit Pfosten und sichtbaren Kreuzstreben. Gleiche Zeichen- und Durchgangsfunktion wie die erste Variante.'),
  kit('ruin', 'kit-arch', 'Ruinenbogen · GLB', 'ruin_arch', 'Steinerner Ruinenbogen aus dem bestehenden Umwelt-Kit.'),
  kit('rock', 'kit-cluster', 'Felsgruppe · GLB', 'rock_cluster', 'Mehrteilige Felsgruppe als Landschaftsobjekt.'),
  kit('rock', 'kit-single', 'Einzelfelsen · GLB', 'rock_single', 'Kompakter einzelner Felsen aus dem Umwelt-Kit.'),
  kit('grass', 'kit-tall', 'Hohes Gras · GLB', 'grass_tall_patch', 'Vorhandene GLB-Grasbüschel als editierbare hohe Grasfläche.'),
  kit('house', 'kit-timber', 'Fachwerkhaus · GLB', 'house_timbersmall', 'Kompaktes Fachwerkhaus aus dem bereits eingebundenen Umwelt-Kit.'),
  { id: 'house:kit-taverne', kind: 'house', variant: 'kit-taverne', label: 'Taverne · GLB', format: 'glb',
    sourceLabel: 'Eigene Blender-Datei · GitHub main', sourcePaths: ['Blender/Taverne.glb'],
    renderer: 'src/world-object-renderer.js', status: 'available', previewKind: 'render',
    notes: 'Große, offene Taverne mit mehreren Räumen und Einrichtung; das Dach ist bereits aus dem Modell entfernt.',
    provenance: 'Blender/Taverne.glb' },
  { id: 'house:kit-tripo-tavern', kind: 'house', variant: 'kit-tripo-tavern', label: 'Wirtshaus · Tripo (neu)', format: 'glb',
    sourceLabel: 'Eigener Tripo-Export · aufbereitetes Spielmodell',
    sourcePaths: ['assets/imported/tripo-tavern/runtime/tavern.glb', 'assets/inbox/medieval tavern interior 3d model.glb'],
    renderer: 'src/world-object-renderer.js', status: 'available', previewKind: 'render',
    notes: 'Neues, dachloses Wirtshaus mit Gastraum, Küche und Einrichtung. Als eigene Variante platzieren, drehen und in 3D testen.',
    provenance: 'assets/imported/tripo-tavern/provenance.json' },
  tripo('house', 'kit-tripo-castle', 'Kleines Schloss · Tripo', 'castle', 'castle interior 3d model',
    'Dachloses Steinschloss mit großem Saal, eingerichteten Seitenräumen und offenen Durchgängen. Als eigenes Gebäude platzieren, drehen und in 3D testen.', 'tripo-castle'),
  kit('crate', 'kit-wood', 'Holzkiste · GLB', 'crate_wood', 'Zerstörbare Holzkiste; blockiert Bewegung, Sicht und Pfeile bis sie kaputt ist.'),
  tripo('wagon', 'kit-tripo-wagon', 'Holzwagen · Tripo', 'wagon', 'wooden wagon 3d model', 'Holzwagen mit texturiertem Holz, Rädern und Deichseln. Drehen, skalieren und als festes Hindernis platzieren.'),
  tripo('barrel', 'kit-tripo-barrel', 'Holzfass · Tripo', 'barrel', 'wooden barrel 3d model', 'Massives Holzfass mit Eisenreifen. Blockiert die Bewegung und lässt sich im Kampf zerstören.'),
  tripo('well', 'kit-tripo-well', 'Steinbrunnen · Tripo', 'well', 'medieval well 3d model', 'Steinerner Brunnen mit Holzaufbau, Dach und Seil. Festes Landschaftsobjekt.'),
  tripo('rock', 'kit-tripo-01', 'Flacher Felsen · Tripo', 'rock-01', 'rock 3d model', 'Breiter, niedriger Naturstein; blockiert Bewegung, lässt hohe Geschosse passieren.'),
  tripo('rock', 'kit-tripo-02', 'Findling · Tripo', 'rock-02', 'rock boulder 3d model', 'Kompakter Findling mit verwitterter Oberfläche als feste Deckung.'),
  tripo('rock', 'kit-tripo-03', 'Hohe Felsgruppe · Tripo', 'rock-03', 'rock formation 3d model', 'Hohe Felsformation mit markanter Silhouette als Sicht- und Bewegungshindernis.'),
  tripo('chest', 'kit-tripo-chest', 'Schatztruhe · Tripo', 'chest', 'treasure chest 3d model', 'Texturierte Schatztruhe mit beweglichem Deckel; öffnet sich mit E und wirft Gold und Ausrüstung aus.', 'tripo-chest'),
].map(asset => Object.freeze({ ...asset, sourcePaths: Object.freeze(asset.sourcePaths) })));

const byId = new Map(ASSET_CATALOG.map(asset => [asset.id, asset]));
export function getVariantAsset(kind, variant) { return byId.get(`${kind}:${variant}`) ?? null; }

/** Fixed catalogue keys only. No names, paths or markup from imported maps are
 * interpolated; an unknown object cannot turn a preview into executable markup. */
export function getVariantPreviewSvg(kind, variant) {
  const asset = getVariantAsset(kind, variant);
  if (!asset) return '';
  const uri = previews[asset.id];
  if (!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(uri ?? '')) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 192" role="img" aria-label="Modellvorschau"><image width="256" height="192" href="${uri}"/></svg>`;
}

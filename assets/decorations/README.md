# Nebeljagd · Original village decorations

The geometry, material palette, wood grain and stone textures are generated locally
by `src/village-details.js`. They contain no downloaded models, image textures,
fonts or material from another game. The source belongs to the Nebeljagd project.

The collection includes dry-stone boundaries, split-rail fencing, an open gate,
iron-banded coopered barrels, braced timber crates, stacked logs with cut ends,
herb planters, earthen pots, framed lanterns, fern fronds, five-petalled meadow
flowers, trail-edge pebbles and fallen twigs. These are original runtime assets;
there is no Blender/GLB export for this decoration collection yet.

Static parts are merged by material, including vertex-color variation, into a
small number of render batches. The lanterns share one emissive material and do
not add shadow-casting point lights. Ferns and flowers are real polygonal geometry.
The lower quality mode reduces scattered vegetation and trail-edge detail density.

`createVillageDetails` returns local X/Z AABB `walls` for fences and stone boundaries,
and circular `collisions` for large props. The gate has a genuine 3.4-unit gap and
its open leaf has a separate collision rectangle. Small flowers, fronds, twigs and
pebbles are deliberately walk-through details. The house entrances, spawn and
known pickup locations are reserved during scattering.

This collection improves scene dressing, rather than proving a final production
art-quality target. It still needs review from the actual game camera and testing
on the school's physical iPads.

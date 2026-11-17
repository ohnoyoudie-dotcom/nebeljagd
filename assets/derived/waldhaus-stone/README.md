# Waldhaus – original Tripo stone foundation

Geometry derived from the existing `assets/imported/tripo-wall/runtime/wall.glb`.
The owner's source and prepared wall package remain unchanged. The runtime uses
the wall's original base-colour, normal and roughness/metalness textures; this
directory contains no duplicate images and no new provider output.

The lower 0.6 m of the 6 m wall is retained at its original X/Y metre scale.
Only wall depth changes to 0.36 m. Normals are transformed by the inverse
transpose; glTF export supplies the Y-up coordinates and matching UV convention.
The top cut sits beneath the Waldhaus timber sill. End pieces are clipped at
runtime rather than stretched along X. Geometry is capped at 2,000 triangles.

Reproduce with `blender -b -t 3 --python scripts/prepare-waldhaus-stone.py`.
`provenance.json` records the source, borrowed PBR image hashes, output checksum,
budget and preparation version. This is local derivation of an already admitted
project asset, not a `game-dev` CLI receipt or a new commercial licence record.

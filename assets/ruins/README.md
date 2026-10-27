# Nebeljagd weathered ruin stone

`src/stone-art.js` generates original 512×512 albedo and bump artwork for the existing ruin geometry. It combines deterministic seamless mineral variation, fine branching fractures, grit, moss colonies, and lichen. No third-party textures, captured game artwork, or external services are used.

`createWeatheredStone(color)` returns a rough `MeshStandardMaterial`; all colour variants share the same two cached texture objects. The existing mesh/collision geometry remains independent. The artwork is generated locally at startup and is included as procedural source in the browser build.

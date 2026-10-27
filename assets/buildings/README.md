# Original Nebeljagd architecture

The architecture in `src/houses.js` is original procedural Three.js geometry and original Canvas material artwork written for Nebeljagd. No third-party game mesh, texture, screenshot, or extracted asset is used. The runtime creates five 256×256 albedo/bump texture pairs: timber, plaster, fieldstone, shingles, and woven cloth. Geometry is merged per shared material and per roof/interior/facade visibility group.

The three buildings are independently styled as a herb cottage (weathered green shingles, herbs and flower boxes), a framed forest inn (cream plaster, blue-grey roof and moon sign), and a fieldstone hunter's lodge (warm clay shingles, stacked firewood and antler gable). Shared physical conventions are a 16×14 unit footprint, a 2.9-unit south entrance, two 2.5-unit bedroom doorways, and a floor surface at y=0.50. The front canopy posts have their own AABB colliders outside the central entrance.

These buildings are editable procedural source assets; they are **not exported Blender models**. The project character supplies the separate Blender/GLB production workflow. The houses can later be authored or exported as modular GLB without changing their runtime cutaway/collision metadata.

The current work is an authored visual prototype. A claim of equivalence to a commercial production's visual quality requires reference-image review and actual iPad hardware testing; neither is established by the procedural source alone.

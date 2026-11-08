# Uploaded bow arrow alignment

The uploaded feathered arrow was rotated as if its shaft lay in the XY plane. Its measured tail-to-tip vector also has a substantial Z component, so the model appeared sideways despite following a straight flight path. `src/arrow-alignment.js` now aligns the actual GLB endpoints with gameplay +Z and the existing collision offsets. Original GLB files and textures are unchanged.

The held arrow ends at the animated bowstring instead of a fixed forward offset. It keeps the same world size on the scaled character and in flight. Bow and arrow use one committed attack direction throughout draw and release. The additional cone-shaped arrow trail and its material are removed; the uploaded feathers remain.

Validation:
- `node --test tests/bow_alignment.test.js tests/extra_weapon_runtime.test.js tests/weapons.test.js tests/projectile.test.js tests/staff_projectile_collision.test.js`
- `npm run build`
- `NEBELJAGD_URL=http://127.0.0.1:8770 python tests/bow_alignment_smoke.py` against the generated `welt/` files; keyboard and native touch, real uploaded bow and arrow, no JavaScript errors.

The alignment regression reads the actual runtime GLB vertices, verifies both measured endpoints, tests the animated nock attachment on both bow variants at player scale 1.2, and turns the actor during the draw to verify the committed flight direction.

# Authored map fixture

`editor-project-worldmap.json` and its matching `.svg` freeze the recovered
31-object project map from commit `09f19bf70af3e73339d09e00ab6d72aee6a40cbf`.
The JSON SHA-256 is
`a9dc2cc720d48eb1d3b1a56319c11ba6f0ca6183b131a9cad76eda14ad1f12b3`.
Geometry, brush, model-placement and SVG regression tests use this reference,
so saving a different valid map online can change regions, objects, paths and
paint without breaking tests that expect a particular historical island.
The editable root SVG is not required to match a newly saved JSON file; the
build renders the matching delivery SVG from the current JSON automatically.

The real root `worldmap.json` is still validated by the production build and
exercised by the online-entry, synchronization and editor-to-game browser
checks. Test fixtures are never used as the published project map.

`scenery-cleanup-worldmap.json` is the unchanged historical `worldmap.json` from
commit `542a38d0f872714a9f14737a5baf39e5dd87e39a` (the scenery cleanup).
Its SHA-256 is `34ac8f1350d59cf5f8bad1402a6afd120edea0ecd6e015716adf95bf802d8807`.
It contains 953 saved objects, including
the original 66 loot items and ten wooden crates used by the existing regression
checks. The deterministic generator and loot-hash assertions are retained.

This fixture is test data only. It is never imported by the game, the editor, or
the build scripts. Tests must not require a user to retain any particular object
in the editable root `worldmap.json`; an empty object list is valid project data.

The landscape and document-import tests use this stable populated map when
testing modifications, invalid fields, copy isolation and namespace conflicts.
The runtime document test separately verifies that an explicitly empty object
list remains empty, without silently regenerating scenery or loot.

# Authored map fixture

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

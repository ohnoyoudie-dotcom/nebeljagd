# Nebeljagd development

- The existing checkout is the working project. Do not create a Git worktree unless explicitly requested.
- Preserve the user's original files in assets/inbox and the authored worldmap.json unless the task explicitly changes them.
- All game and editor changes must reach the usable editor file. After relevant source changes, run the required tests and `npm run build`; this builds and synchronizes the portal, game and editor into `welt/` and records their hashes in `welt/release.json`. Do not leave a finished change only in src/ or an alternate editor copy.
- `welt/index.html` is the shared entry, `welt/map-editor.html` the current editor, and `welt/nebeljagd.html` the game. Keep teacher links pointing to this current editor. Do not overwrite the portal with a game alias when publishing.
- Validate changed flows in the actual generated files. Keep offline single-player/editor behavior distinct from the classroom server's authenticated code flow. Never describe device-local storage as shared class authentication or multiplayer.
- Credentials and classroom state belong in the ignored .nebeljagd/ directory, never in source, browser bundles, test reports or Git.
- The development base is work. Do not publish to main without a user request. Building/synchronizing files locally does not mean they were pushed or deployed.

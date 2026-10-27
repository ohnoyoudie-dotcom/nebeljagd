import { build } from 'vite';
import { resolve } from 'node:path';

// Separate entry builds intentionally duplicate the shared map modules. Each
// resulting HTML can then work offline without fetching a shared JavaScript chunk.
for (const entry of ['index.html', 'map-editor.html']) {
  await build({
    build: {
      emptyOutDir: entry === 'index.html',
      rolldownOptions: { input: resolve(entry) },
    },
  });
}

import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative asset URLs also work when the game is hosted in a repository subdirectory.
  base: './',
  build: {
    // Both entries can be packaged into a single offline HTML file. Avoid a
    // shared module-preload helper, which would introduce an external import.
    modulePreload: false,
    rolldownOptions: {
      input: {
        game: resolve('index.html'),
        mapEditor: resolve('map-editor.html'),
      },
    },
  },
});

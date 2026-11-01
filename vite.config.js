import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative asset URLs also work when the game is hosted in a repository subdirectory.
  base: './',
  server: { proxy: { '/api': { target: 'http://127.0.0.1:5200' } } },
  build: {
    // Both entries can be packaged into a single offline HTML file. Avoid a
    // shared module-preload helper, which would introduce an external import.
    modulePreload: false,
    rolldownOptions: {
      input: {
        portal: resolve('index.html'),
        teacher: resolve('teacher.html'),
        lobby: resolve('lobby.html'),
        game: resolve('game.html'),
        mapEditor: resolve('map-editor.html'),
      },
    },
  },
});

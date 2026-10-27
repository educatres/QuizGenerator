import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  const source = `node_modules/pdfjs-dist/${folder}`;
  if (existsSync(source)) {
    mkdirSync(`public/pdfjs/${folder}`, { recursive: true });
    cpSync(source, `public/pdfjs/${folder}`, { recursive: true });
  }
}

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1800 },
});

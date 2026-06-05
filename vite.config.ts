import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Use relative asset URLs so the POC works from subfolders like GitHub Pages
  // and when the built dist folder is opened from a simple static file server.
  base: './',
  plugins: [react()],
});

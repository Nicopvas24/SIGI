import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Las vistas React viven en app/views (capa Vista del MVC).
// El build se publica en public/ (punto de entrada y recursos estáticos),
// desde donde Express lo sirve en producción.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../public',
    emptyOutDir: false,
    assetsDir: 'js',
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ['**/.agent/**', '**/test-results/**', '**/playwright-report/**'] } },
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] } } } },
});

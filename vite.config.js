import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: 'https://sunujh6.github.io/vibecode-omok/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
})

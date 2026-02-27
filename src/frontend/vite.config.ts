import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3030,
    proxy: {
      '/api': 'http://localhost:3031',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})

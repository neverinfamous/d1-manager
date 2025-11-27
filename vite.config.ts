import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Increase chunk size warning limit (default is 500 kB)
    // Main app bundle is ~740 kB with heavy dependencies already split out
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting
        manualChunks: {
          // Vendor chunks for large dependencies
          'vendor-react': ['react', 'react-dom'],
          'vendor-reactflow': ['reactflow'],
          'vendor-pdf': ['jspdf'],
          'vendor-zip': ['jszip'],
        },
      },
    },
  },
})


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
    // Main app bundle is ~750 kB with heavy dependencies split out
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting
        manualChunks: {
          // Vendor chunks for large dependencies
          'vendor-react': ['react', 'react-dom'],
          'vendor-reactflow': ['reactflow', '@reactflow/core', '@reactflow/minimap', '@reactflow/controls', '@reactflow/background'],
          'vendor-pdf': ['jspdf'],
          'vendor-zip': ['jszip'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-checkbox', '@radix-ui/react-label', '@radix-ui/react-radio-group', '@radix-ui/react-accordion', '@radix-ui/react-progress', '@radix-ui/react-slot'],
        },
      },
    },
  },
})


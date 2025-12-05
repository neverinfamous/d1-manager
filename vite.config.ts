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
    // Chunk size warning limit - raised to accommodate optimized chunks
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting - split large vendor deps
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'scheduler'],
          'vendor-reactflow': ['reactflow', '@reactflow/core', '@reactflow/minimap', '@reactflow/controls', '@reactflow/background', 'dagre'],
          'vendor-pdf': ['jspdf', 'html2canvas'],
          'vendor-zip': ['jszip'],
          'vendor-ui': [
            '@radix-ui/react-dialog', 
            '@radix-ui/react-select', 
            '@radix-ui/react-checkbox', 
            '@radix-ui/react-label', 
            '@radix-ui/react-radio-group', 
            '@radix-ui/react-accordion', 
            '@radix-ui/react-progress', 
            '@radix-ui/react-slot'
          ],
          'vendor-icons': ['lucide-react'],
          'vendor-sql': ['sql-formatter', 'prismjs'],
          'vendor-utils': ['diff', 'drizzle-orm', 'jose'],
        },
      },
    },
  },
})


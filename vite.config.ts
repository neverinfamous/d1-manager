import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Chunk size warning limit - raised to accommodate optimized chunks
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting - split large vendor deps
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          // Route the prism wrapper (src/lib/prism.ts) into the same chunk
          // as prismjs from node_modules. The wrapper sets globalThis.Prism
          // which is required by prism-sql's bare Prism reference in Rolldown.
          if (normalizedId.includes("/src/lib/prism")) return "vendor-prism";
          if (normalizedId.includes("node_modules")) {
            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/scheduler/")
            )
              return "vendor-react";
            if (
              normalizedId.includes("@reactflow") ||
              normalizedId.includes("reactflow") ||
              normalizedId.includes("dagre")
            )
              return "vendor-reactflow";
            if (
              normalizedId.includes("jspdf") ||
              normalizedId.includes("html2canvas")
            )
              return "vendor-pdf";
            if (normalizedId.includes("jszip")) return "vendor-zip";
            if (normalizedId.includes("@radix-ui")) return "vendor-ui";
            if (normalizedId.includes("lucide-react")) return "vendor-icons";
            if (normalizedId.includes("prismjs")) return "vendor-prism";
            if (normalizedId.includes("sql-formatter")) return "vendor-sql";
            if (
              normalizedId.includes("diff") ||
              normalizedId.includes("drizzle-orm") ||
              normalizedId.includes("jose")
            )
              return "vendor-utils";
          }
        },
      },
    },
  },
});

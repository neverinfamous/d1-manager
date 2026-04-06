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
          if (id.includes("node_modules")) {
            if (
              id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/scheduler/")
            )
              return "vendor-react";
            if (
              id.includes("@reactflow") ||
              id.includes("reactflow") ||
              id.includes("dagre")
            )
              return "vendor-reactflow";
            if (id.includes("jspdf") || id.includes("html2canvas"))
              return "vendor-pdf";
            if (id.includes("jszip")) return "vendor-zip";
            if (id.includes("@radix-ui")) return "vendor-ui";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("sql-formatter") || id.includes("prismjs"))
              return "vendor-sql";
            if (
              id.includes("diff") ||
              id.includes("drizzle-orm") ||
              id.includes("jose")
            )
              return "vendor-utils";
          }
        },
      },
    },
  },
});

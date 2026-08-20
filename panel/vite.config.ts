import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const panelRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: panelRoot,
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3010",
    },
  },
  build: {
    outDir: resolve(panelRoot, "../dist/panel"),
    emptyOutDir: true,
  },
});

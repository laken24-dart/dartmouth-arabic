import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" + HashRouter lets the built site open from any folder (or straight from disk).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: { chunkSizeWarningLimit: 900 }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE is the single knob for subpath embeds.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  // Honor a harness/host-assigned port (e.g. Claude Code's preview autoPort).
  server: process.env.PORT
    ? { port: Number(process.env.PORT), strictPort: true }
    : {},
  build: {
    outDir: "dist/client",
    chunkSizeWarningLimit: 1200,
  },
});

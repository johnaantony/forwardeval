import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the build portable - works at a domain root (Vercel) and at
// a project sub-path (GitHub Pages /forwardeval/) without reconfiguration.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
});

import { defineConfig } from "vite";

// Tauri owns the window; Vite only serves and bundles the page. The port is
// fixed because tauri.conf.json points at it, and a fallback port would leave
// the shell staring at nothing.
export default defineConfig(({ mode }) => ({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    minify: mode === "production",
    sourcemap: mode !== "production",
  },
  define: {
    __DEV_BUILD__: JSON.stringify(mode !== "production"),
  },
}));

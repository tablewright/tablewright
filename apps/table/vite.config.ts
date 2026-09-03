import { defineConfig } from "vite";

// Tauri owns the window; Vite only serves and bundles the page. The port is
// fixed because tauri.conf.json points at it, and a fallback port would leave
// the shell staring at nothing.
export default defineConfig(({ mode }) => ({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // `bun run dev:tunnel` with `bun run demo` fronts this server with a
    // cloudflared quick tunnel, for a phone or a guest. Vite must accept
    // that host, and the hot-reload client must come back through the
    // tunnel on 443 rather than to port 1420 on the tunnel's name.
    allowedHosts: [".trycloudflare.com"],
    ...(mode === "tunnel" ? { hmr: { clientPort: 443, protocol: "wss" } } : {}),
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

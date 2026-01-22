import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  clearScreen: false,
  // Port: defaults to 1430, auto-increments if busy
  // Set VITE_PORT env var to override
  server: {
    port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 1430,
    strictPort: false, // Allow auto-increment for multiple instances
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: process.env.VITE_HMR_PORT ? parseInt(process.env.VITE_HMR_PORT) : 1431,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

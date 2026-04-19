import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const BACKEND = "http://localhost:8000";

const API_PREFIXES = [
  "/auth",
  "/health",
  "/subjects",
  "/week-schemes",
  "/rooms",
  "/teachers",
  "/stundentafeln",
  "/classes",
  "/lessons",
];

export default defineConfig({
  plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [prefix, { target: BACKEND, changeOrigin: true }]),
    ),
  },
  preview: {
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [prefix, { target: BACKEND, changeOrigin: true }]),
    ),
  },
});

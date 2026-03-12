import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => {
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    build: {
      target: "chrome120",
      reportCompressedSize: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            tauri: [
              "@tauri-apps/api",
              "@tauri-apps/plugin-dialog",
              "@tauri-apps/plugin-fs",
              "@tauri-apps/plugin-opener",
              "@tauri-apps/plugin-process",
              "@tauri-apps/plugin-updater",
            ],
          },
        },
      },
    },
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});

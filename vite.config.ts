import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: "spa-fallback",
      apply: "serve",
      configureServer(server) {
        return () => {
          server.middlewares.use((req, res, next) => {
            // Rewrite all non-file routes to index.html for client-side routing
            if (
              req.url !== "/" &&
              !req.url.includes(".") &&
              !req.url.startsWith("/api")
            ) {
              req.url = "/index.html";
            }
            next();
          });
        };
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

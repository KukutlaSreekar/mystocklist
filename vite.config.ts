import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const spaFallbackPlugin = (): Plugin => ({
  name: "spa-fallback",
  apply: "serve",
  configureServer(server) {
    return () => {
      server.middlewares.use((req, _res, next) => {
        if (
          req.url !== "/" &&
          !req.url?.includes(".") &&
          !req.url?.startsWith("/api")
        ) {
          req.url = "/index.html";
        }
        next();
      });
    };
  },
});

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
    ...(mode === "development" ? [componentTagger()] : []),
    spaFallbackPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

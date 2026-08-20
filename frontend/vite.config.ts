import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Route-level code splitting lives in App.tsx (React.lazy). This adds
    // vendor splitting on top so the rarely-changing framework code sits in
    // its own long-cached chunk instead of being invalidated by every app
    // edit. Remotion/moveable are named explicitly because they're huge and
    // only used by the editor and admin routes respectively.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-remotion": ["remotion", "@remotion/player"],
          "vendor-moveable": ["react-moveable"],
        },
      },
    },
    // The default 500 kB warning fired constantly on the old single bundle.
    // Route chunks are now well under this; keep it as a real regression alarm.
    chunkSizeWarningLimit: 500,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Vite blocks requests with an unrecognized Host header by default
    // (DNS-rebinding protection). localhost/LAN IPs are allowed automatically;
    // this only adds ngrok's own domains so the demo tunnel isn't blocked.
    // Dev-server only — irrelevant to any production build/deploy.
    allowedHosts: [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app", ".ngrok.io", ".trycloudflare.com"],
    // Only exercised when the app is told to use a relative API base
    // (VITE_API_URL=/api — the ngrok single-tunnel demo mode). Normal local/LAN
    // dev calls the backend directly on :8000 and never hits this, so it's a
    // no-op otherwise. "backend" is the docker-compose service DNS name.
    proxy: {
      // In production Caddy routes /sitemap.xml to the backend (it's generated
      // from the DB, not a static file). Mirror that here so the dev server
      // doesn't just hand back the SPA shell for it — otherwise the URL looks
      // broken locally while being fine in prod.
      "/sitemap.xml": {
        target: "http://backend:8000",
        changeOrigin: false,
      },
      "/api": {
        target: "http://backend:8000",
        // Keep the original Host header (whatever the browser used — the
        // ngrok domain) rather than rewriting it to "backend:8000": FastAPI's
        // trailing-slash redirects echo back whatever Host they saw, and a
        // rewritten Host would produce a Location the browser can't resolve.
        changeOrigin: false,
      },
    },
  },
});

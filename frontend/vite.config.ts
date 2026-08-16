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

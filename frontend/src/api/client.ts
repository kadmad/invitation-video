import axios from "axios";

// Mirror whatever host the browser used to load the page (localhost, a LAN IP
// when opened from a phone on the same WiFi, or a real domain in production)
// so the app works on any device/network without per-machine config. An
// explicit VITE_API_URL still wins when set (e.g. a separate API domain).
const inferredApiUrl = `${window.location.protocol}//${window.location.hostname}:8000/api`;
export const API_URL = import.meta.env.VITE_API_URL || inferredApiUrl;

// True only when VITE_API_URL is explicitly set to a relative path (the
// single-tunnel ngrok demo mode — see vite.config.ts's /api proxy). In that
// mode MinIO isn't separately reachable, so video/preview playback must go
// through the backend-streamed same-origin URLs instead of direct S3 links.
export const IS_PROXIED_API = API_URL.startsWith("/");

const client = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
    }
    return Promise.reject(error);
  }
);

export default client;

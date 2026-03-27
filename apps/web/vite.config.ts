import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env["INFRALYNX_WEB_API_ORIGIN"] ?? "http://localhost:4010",
        changeOrigin: true
      }
    }
  }
});

import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  base: "/dashboard/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5180,
    // the landing (fonts, favicon) is served from the site folder on :4611
    proxy: { "/fonts": "http://127.0.0.1:4611", "/favicon.svg": "http://127.0.0.1:4611" },
  },
})

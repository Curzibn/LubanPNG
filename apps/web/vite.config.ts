import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const backend = process.env.LUBANPNG_API_ORIGIN ?? "http://127.0.0.1:3000"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/v1": backend,
      "/swagger-ui": backend,
      "/api-doc": backend,
      "/healthz": backend,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
})

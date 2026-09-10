import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

const backend = process.env.LUBANPNG_API_ORIGIN ?? "http://127.0.0.1:3000"
const require = createRequire(import.meta.url)
const faviconSource = require.resolve("@lubanpng/design-tokens/favicon.svg")
const favicon = () => readFileSync(faviconSource, "utf8")

const faviconAsset = (): Plugin => ({
  name: "lubanpng-favicon",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split("?")[0] === "/favicon.svg") {
        response.setHeader("Content-Type", "image/svg+xml")
        response.end(favicon())
        return
      }
      next()
    })
  },
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "favicon.svg", source: favicon() })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), faviconAsset()],
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

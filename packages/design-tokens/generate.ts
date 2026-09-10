import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { renderFavicon, renderTheme } from "./render.ts"

const distDir = join(dirname(fileURLToPath(import.meta.url)), "dist")

mkdirSync(distDir, { recursive: true })
writeFileSync(join(distDir, "theme.css"), renderTheme())
writeFileSync(join(distDir, "favicon.svg"), renderFavicon())

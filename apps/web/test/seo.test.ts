import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public")
const sitemap = readFileSync(join(publicDir, "sitemap.xml"), "utf8")
const robots = readFileSync(join(publicDir, "robots.txt"), "utf8")
const llms = readFileSync(join(publicDir, "llms.txt"), "utf8")

const locs = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1] ?? "")

describe("sitemap", () => {
  it("lists the five public routes in both languages", () => {
    expect(locs).toEqual([
      "https://lubanpng.wizthink.cn/",
      "https://lubanpng.wizthink.cn/en/",
      "https://lubanpng.wizthink.cn/pricing",
      "https://lubanpng.wizthink.cn/en/pricing",
      "https://lubanpng.wizthink.cn/developers",
      "https://lubanpng.wizthink.cn/en/developers",
      "https://lubanpng.wizthink.cn/terms",
      "https://lubanpng.wizthink.cn/en/terms",
      "https://lubanpng.wizthink.cn/privacy",
      "https://lubanpng.wizthink.cn/en/privacy",
    ])
  })

  it("gives every entry reciprocal hreflang alternates with Chinese as x-default", () => {
    const entries = sitemap.split("<url>").slice(1)
    expect(entries).toHaveLength(10)
    for (const entry of entries) {
      expect(entry).toContain('hreflang="zh-CN"')
      expect(entry).toContain('hreflang="en"')
      expect(entry).toContain('hreflang="x-default"')
    }
    expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
  })
})

describe("robots", () => {
  it("keeps the private pages out of the index in both languages", () => {
    for (const path of ["/dashboard", "/login", "/en/dashboard", "/en/login"]) {
      expect(robots).toContain(`Disallow: ${path}\n`)
    }
    expect(robots).toContain("Sitemap: https://lubanpng.wizthink.cn/sitemap.xml")
  })
})

describe("llms.txt", () => {
  it("covers both capabilities", () => {
    expect(llms).toMatch(/^# LubanPNG\n/)
    expect(llms).toContain("Compression")
    expect(llms).toContain("Upscaling")
    expect(llms).toContain("压缩")
    expect(llms).toContain("放大")
  })

  it("lists the three access channels and marks the unshipped ones as planned", () => {
    expect(llms).toContain("REST + API key")
    expect(llms).toContain("MCP server (planned, not yet available)")
    expect(llms).toContain("x402 pay-per-call (planned, not yet available)")
  })
})

import { readFileSync, readdirSync } from "node:fs"
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

  it("carries one shared lastmod date on every entry", () => {
    const dates = Array.from(sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g), (match) => match[1])
    expect(dates).toHaveLength(10)
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Set(dates).size).toBe(1)
  })
})

const robotsGroups = robots
  .split(/\n\s*\n/)
  .map((block) => block.trim())
  .filter((block) => block.length > 0)

const groupFor = (agent: string): string | undefined =>
  robotsGroups.find((block) => block.split("\n").includes(`User-agent: ${agent}`))

describe("robots", () => {
  it("keeps the private pages out of the index in both languages", () => {
    for (const path of ["/dashboard", "/login", "/en/dashboard", "/en/login"]) {
      expect(robots).toContain(`Disallow: ${path}\n`)
    }
    expect(robots).toContain("Sitemap: https://lubanpng.wizthink.cn/sitemap.xml")
  })

  it("explicitly welcomes the search and AI crawlers with the same private-page rules", () => {
    for (const agent of [
      "Googlebot",
      "Bingbot",
      "Baiduspider",
      "GPTBot",
      "ClaudeBot",
      "PerplexityBot",
      "Google-Extended",
      "CCBot",
    ]) {
      const group = groupFor(agent)
      expect(group, `missing user-agent group for ${agent}`).toBeDefined()
      const lines = group!.split("\n")
      expect(lines, `${agent} must allow the public site`).toContain("Allow: /")
      for (const path of ["/dashboard", "/login", "/en/dashboard", "/en/login"]) {
        expect(lines, `${agent} must keep ${path} out`).toContain(`Disallow: ${path}`)
      }
    }
  })
})

describe("IndexNow", () => {
  it("ships exactly one key file whose content matches its own name", () => {
    const files = readdirSync(publicDir).filter((name) => /^[a-f0-9]{8,128}\.txt$/.test(name))
    expect(files).toHaveLength(1)
    const name = files[0]!
    expect(readFileSync(join(publicDir, name), "utf8").trim()).toBe(name.replace(/\.txt$/, ""))
  })
})

describe("platform verification files", () => {
  it("ships Google Search Console verification files from the site root", () => {
    const files = readdirSync(publicDir).filter((name) => /^google[a-z0-9]+\.html$/.test(name))
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const content = readFileSync(join(publicDir, name), "utf8")
      expect(content.trim()).toBe(`google-site-verification: ${name}`)
    }
  })

  it("ships the Bing Webmaster verification file from the site root", () => {
    const content = readFileSync(join(publicDir, "BingSiteAuth.xml"), "utf8")
    expect(content).toMatch(/<users>[\s\S]*<user>[0-9A-Za-z-]+<\/user>[\s\S]*<\/users>/)
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

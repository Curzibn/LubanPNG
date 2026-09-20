import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { emitStaticShells } from "../vite.shells.ts"
import { buildPageHead, SITE_ORIGIN, type PublicRouteId } from "../src/i18n/meta.ts"
import type { Locale } from "../src/i18n/locale.ts"
import { buildShellArtifacts, renderShellDocument, shellFileName, shellUrlPath } from "../src/i18n/shells.ts"

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const indexHtml = readFileSync(join(webRoot, "index.html"), "utf8")
const artifacts = buildShellArtifacts(indexHtml)

const routes: ReadonlyArray<{ routeId: PublicRouteId; zh: string; en: string }> = [
  { routeId: "home", zh: "zh/home.html", en: "en/home.html" },
  { routeId: "pricing", zh: "zh/pricing.html", en: "en/pricing.html" },
  { routeId: "developers", zh: "zh/developers.html", en: "en/developers.html" },
  { routeId: "terms", zh: "zh/terms.html", en: "en/terms.html" },
  { routeId: "privacy", zh: "zh/privacy.html", en: "en/privacy.html" },
]

const artifactFor = (routeId: PublicRouteId, locale: Locale) => {
  const found = artifacts.find((artifact) => artifact.routeId === routeId && artifact.locale === locale)
  if (found === undefined) throw new Error(`missing shell ${routeId}/${locale}`)
  return found
}

const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

const descriptionOf = (routeId: PublicRouteId, locale: Locale): string =>
  buildPageHead(routeId, locale, shellUrlPath(routeId, locale)).metas.find((meta) => meta.key === "description")!.content

const headOf = (html: string): string => html.slice(0, html.indexOf("</head>"))

const attributeOf = (html: string, pattern: RegExp): string | null => html.match(pattern)?.[1] ?? null

describe("static shells", () => {
  it("emits the ten public route shells under zh and en", () => {
    expect(artifacts.map((artifact) => artifact.fileName).sort()).toEqual(
      routes.flatMap((route) => [route.zh, route.en]).sort(),
    )
    expect(artifacts).toHaveLength(10)
  })

  it("names and maps every route to its localized path", () => {
    for (const route of routes) {
      expect(shellFileName(route.routeId, "zh-CN")).toBe(route.zh)
      expect(shellFileName(route.routeId, "en")).toBe(route.en)
    }
    expect(shellUrlPath("home", "zh-CN")).toBe("/")
    expect(shellUrlPath("home", "en")).toBe("/en/")
    expect(shellUrlPath("pricing", "en")).toBe("/en/pricing")
    expect(shellUrlPath("privacy", "zh-CN")).toBe("/privacy")
  })

  it("fills the language, title and description from the active locale only", () => {
    for (const route of routes) {
      for (const locale of ["zh-CN", "en"] as Locale[]) {
        const artifact = artifactFor(route.routeId, locale)
        const expected = buildPageHead(route.routeId, locale, artifact.urlPath)
        expect(attributeOf(artifact.html, /<html lang="([^"]+)"/)).toBe(locale)
        expect(artifact.html).toContain(`<title>${expected.title}</title>`)
        expect(artifact.html).toContain(`<meta name="description" content="${descriptionOf(route.routeId, locale)}" />`)
      }
    }
  })

  it("keeps canonical and hreflang reciprocal with Chinese as x-default", () => {
    for (const route of routes) {
      for (const locale of ["zh-CN", "en"] as Locale[]) {
        const { html, urlPath } = artifactFor(route.routeId, locale)
        expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}${urlPath}" />`)
        expect(html).toContain(`hreflang="zh-CN" href="${SITE_ORIGIN}${shellUrlPath(route.routeId, "zh-CN")}"`)
        expect(html).toContain(`hreflang="en" href="${SITE_ORIGIN}${shellUrlPath(route.routeId, "en")}"`)
        expect(html).toContain(`hreflang="x-default" href="${SITE_ORIGIN}${shellUrlPath(route.routeId, "zh-CN")}"`)
      }
    }
  })

  it("points social cards at the official origin and the matching share image", () => {
    for (const locale of ["zh-CN", "en"] as Locale[]) {
      const { html, urlPath } = artifactFor("home", locale)
      const image = locale === "en" ? `${SITE_ORIGIN}/og-en.png` : `${SITE_ORIGIN}/og.png`
      expect(html).toContain(`<meta property="og:url" content="${SITE_ORIGIN}${urlPath}" />`)
      expect(html).toContain(`<meta property="og:image" content="${image}" />`)
      expect(html).toContain(`<meta name="twitter:image" content="${image}" />`)
      expect(html).toContain(`<meta property="og:locale" content="${locale === "en" ? "en_US" : "zh_CN"}" />`)
    }
    expect(artifactFor("home", "en").html).toContain(`${SITE_ORIGIN}/og-en.png`)
    expect(attributeOf(artifactFor("home", "en").html, /<meta property="og:image" content="([^"]+)"/)).not.toContain("/og.png\"")
  })

  it("leaves no trace of the other language in the head", () => {
    for (const route of routes) {
      for (const locale of ["zh-CN", "en"] as Locale[]) {
        const other: Locale = locale === "en" ? "zh-CN" : "en"
        const artifact = artifactFor(route.routeId, locale)
        const head = headOf(artifact.html)
        const foreign = buildPageHead(route.routeId, other, shellUrlPath(route.routeId, other))
        expect(head).not.toContain(foreign.title)
        expect(head).not.toContain(descriptionOf(route.routeId, other))
        if (locale === "en") {
          expect(cjk.test(head)).toBe(false)
          expect(attributeOf(head, /<meta property="og:locale" content="([^"]+)"/)).toBe("en_US")
        } else {
          expect(attributeOf(head, /<meta property="og:locale" content="([^"]+)"/)).toBe("zh_CN")
        }
      }
    }
  })

  it("declares each head field exactly once", () => {
    for (const artifact of artifacts) {
      const head = headOf(artifact.html)
      expect(head.match(/<title>/g)).toHaveLength(1)
      expect(head.match(/<meta name="description"/g)).toHaveLength(1)
      expect(head.match(/rel="canonical"/g)).toHaveLength(1)
      expect(head.match(/hreflang="x-default"/g)).toHaveLength(1)
      expect(head.match(/property="og:url"/g)).toHaveLength(1)
      expect(head.match(/property="og:image"/g)).toHaveLength(1)
    }
  })

  it("keeps the SPA bootstrapping identical to the index document", () => {
    for (const artifact of artifacts) {
      expect(artifact.html).toContain('<div id="root"></div>')
      expect(artifact.html).toContain(`src="/src/main.tsx"`)
      expect(artifact.html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
      expect(artifact.html).toContain("fonts.googleapis.com/css2?family=IBM+Plex+Mono")
    }
  })

  it("builds the Chinese home shell from the same definition as the index document", () => {
    const home = artifactFor("home", "zh-CN")
    expect(home.head).toEqual(buildPageHead("home", "zh-CN", "/"))
    expect(headOf(home.html)).toBe(headOf(renderShellDocument(indexHtml, home.head)))
  })

  it("keeps the index document free of a second copy of the head", () => {
    expect(indexHtml).not.toContain("<title>")
    expect(indexHtml).not.toMatch(/<meta\s+(?:name|property)="(?:description|og:|twitter:)/)
    expect(indexHtml).not.toMatch(/rel="(?:canonical|alternate)"/)
  })

  it("escapes head values instead of emitting raw markup", () => {
    const html = renderShellDocument("<!doctype html><html><head><title>old</title></head><body></body></html>", {
      lang: "en",
      title: 'A "quoted" <title>',
      metas: [{ attr: "name", key: "description", content: "a & b" }],
      links: [{ rel: "canonical", href: `${SITE_ORIGIN}/a?b=1&c=2` }],
    })
    expect(html).toContain("<title>A &quot;quoted&quot; &lt;title&gt;</title>")
    expect(html).toContain('content="a &amp; b"')
    expect(html).toContain('href="https://lubanpng.wizthink.cn/a?b=1&amp;c=2"')
    expect(html).toContain('<html lang="en">')
  })

  it("writes the shells into the build output next to index.html", () => {
    const outDir = mkdtempSync(join(tmpdir(), "lubanpng-shells-"))
    writeFileSync(join(outDir, "index.html"), indexHtml)
    const written = emitStaticShells(outDir)
    expect(written).toHaveLength(10)
    expect(readdirSync(join(outDir, "shells")).sort()).toEqual(["en", "zh"])
    expect(readdirSync(join(outDir, "shells", "en")).sort()).toEqual(routes.map((route) => route.en.split("/")[1]).sort())
  })

  it("fails loudly when the built index document is missing", () => {
    const outDir = mkdtempSync(join(tmpdir(), "lubanpng-shells-empty-"))
    expect(() => emitStaticShells(outDir)).toThrow()
  })
})

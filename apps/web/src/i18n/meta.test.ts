import { describe, expect, it } from "vitest"
import { buildPageHead, SITE_ORIGIN, type RouteMetaId } from "./meta.ts"

const linkFor = (head: ReturnType<typeof buildPageHead>, rel: string, hreflang?: string): string | undefined =>
  head.links.find((link) => link.rel === rel && link.hreflang === hreflang)?.href

const metaFor = (head: ReturnType<typeof buildPageHead>, key: string): string | undefined =>
  head.metas.find((meta) => meta.key === key)?.content

describe("buildPageHead", () => {
  it("uses the Chinese canonical path with self-referencing hreflang for the Chinese site", () => {
    const head = buildPageHead("pricing", "zh-CN", "/pricing")
    expect(head.lang).toBe("zh-CN")
    expect(head.title).toBe("定价 · LubanPNG")
    expect(linkFor(head, "canonical")).toBe(`${SITE_ORIGIN}/pricing`)
    expect(linkFor(head, "alternate", "zh-CN")).toBe(`${SITE_ORIGIN}/pricing`)
    expect(linkFor(head, "alternate", "en")).toBe(`${SITE_ORIGIN}/en/pricing`)
    expect(linkFor(head, "alternate", "x-default")).toBe(`${SITE_ORIGIN}/pricing`)
  })

  it("points an English page at the /en URL and keeps x-default on Chinese", () => {
    const head = buildPageHead("pricing", "en", "/en/pricing")
    expect(head.lang).toBe("en")
    expect(head.title).toBe("Pricing · LubanPNG")
    expect(linkFor(head, "canonical")).toBe(`${SITE_ORIGIN}/en/pricing`)
    expect(linkFor(head, "alternate", "zh-CN")).toBe(`${SITE_ORIGIN}/pricing`)
    expect(linkFor(head, "alternate", "en")).toBe(`${SITE_ORIGIN}/en/pricing`)
    expect(linkFor(head, "alternate", "x-default")).toBe(`${SITE_ORIGIN}/pricing`)
  })

  it("treats the home page as the site root in both languages", () => {
    expect(linkFor(buildPageHead("home", "zh-CN", "/"), "canonical")).toBe(`${SITE_ORIGIN}/`)
    expect(linkFor(buildPageHead("home", "en", "/en/"), "canonical")).toBe(`${SITE_ORIGIN}/en/`)
    expect(linkFor(buildPageHead("home", "en", "/en/"), "alternate", "x-default")).toBe(`${SITE_ORIGIN}/`)
  })

  it("describes the page for search engines and social cards in the active language", () => {
    const zh = buildPageHead("developers", "zh-CN", "/developers")
    const en = buildPageHead("developers", "en", "/en/developers")
    expect(metaFor(zh, "description")).toContain("上传、查询、下载")
    expect(metaFor(en, "description")).toContain("upload, poll, download")
    expect(metaFor(zh, "og:locale")).toBe("zh_CN")
    expect(metaFor(zh, "og:locale:alternate")).toBe("en_US")
    expect(metaFor(en, "og:locale")).toBe("en_US")
    expect(metaFor(zh, "og:url")).toBe(`${SITE_ORIGIN}/developers`)
    expect(metaFor(en, "og:url")).toBe(`${SITE_ORIGIN}/en/developers`)
    expect(metaFor(zh, "og:image")).toBe(`${SITE_ORIGIN}/og.png`)
    expect(metaFor(en, "og:image")).toBe(`${SITE_ORIGIN}/og-en.png`)
    expect(metaFor(en, "twitter:image")).toBe(`${SITE_ORIGIN}/og-en.png`)
  })

  it("keeps canonical and hreflang off the pages that are not indexed", () => {
    for (const id of ["login", "dashboard", "notFound"] as RouteMetaId[]) {
      const head = buildPageHead(id, "en", `/en/${id}`)
      expect(head.links).toEqual([])
      expect(head.title.endsWith("· LubanPNG")).toBe(true)
    }
  })
})

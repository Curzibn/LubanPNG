import { describe, expect, it } from "vitest"
import { messages } from "../src/i18n/messages.ts"
import { SITE_ORIGIN } from "../src/i18n/meta.ts"
import { buildStaticContent, buildStructuredData, htmlEscape, renderJsonLd, type JsonLd } from "../src/i18n/prerender.ts"

const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

const zh = messages["zh-CN"]
const en = messages.en

describe("static content", () => {
  it("carries the Chinese home copy and both integration teasers", () => {
    const html = buildStaticContent("home", "zh-CN")
    expect(html).toContain(htmlEscape(zh["home.title"]))
    expect(html).toContain(htmlEscape(zh["meta.home.description"]))
    expect(html).toContain(htmlEscape(zh["teaser.api.title"]))
    expect(html).toContain(htmlEscape(zh["teaser.cli.title"]))
    expect(html).toContain("npm i -g lubanpng")
  })

  it("carries the Chinese pricing plans and every FAQ answer", () => {
    const html = buildStaticContent("pricing", "zh-CN")
    expect(html).toContain(htmlEscape(zh["pricing.title"]))
    expect(html).toContain(htmlEscape(zh["pricing.free.price"]))
    expect(html).toContain(htmlEscape(zh["pricing.free.feature1"]))
    expect(html).toContain(htmlEscape(zh["pricing.planned"]))
    expect(html).toContain(htmlEscape(zh["pricing.faq.q1"]))
    expect(html).toContain(htmlEscape(zh["pricing.faq.a1"]))
    expect(html).toContain(htmlEscape(zh["pricing.faq.a5"]))
  })

  it("carries the English developer steps, endpoint paths and error codes", () => {
    const html = buildStaticContent("developers", "en")
    expect(html).toContain(htmlEscape(en["dev.title"]))
    expect(html).toContain(htmlEscape(en["dev.step1"]))
    expect(html).toContain(htmlEscape(en["dev.step2"]))
    expect(html).toContain(htmlEscape(en["dev.step3"]))
    expect(html).toContain("/v1/images/upscale")
    expect(html).toContain(">4003<")
    expect(html).toContain(htmlEscape(en["dev.format.heic.note"]))
  })

  it("renders the localized not-found copy", () => {
    const html = buildStaticContent("notFound", "zh-CN")
    expect(html).toContain(htmlEscape(zh["nf.title"]))
    expect(html).toContain(htmlEscape(zh["nf.body"]))
  })

  it("leaves the legal pages without a static fragment", () => {
    expect(buildStaticContent("terms", "zh-CN")).toBe("")
    expect(buildStaticContent("privacy", "en")).toBe("")
  })

  it("keeps every English fragment free of Chinese characters", () => {
    for (const routeId of ["home", "pricing", "developers", "notFound"] as const) {
      expect(cjk.test(buildStaticContent(routeId, "en")), routeId).toBe(false)
    }
  })
})

describe("structured data", () => {
  it("describes the product as a free web application on the home page", () => {
    const data = buildStructuredData("home", "zh-CN")
    expect(data?.["@context"]).toBe("https://schema.org")
    expect(data?.["@type"]).toBe("SoftwareApplication")
    expect(data?.["name"]).toBe("LubanPNG")
    expect(data?.["url"]).toBe(`${SITE_ORIGIN}/`)
    expect(data?.["offers"]).toEqual({ "@type": "Offer", price: "0", priceCurrency: "CNY" })
    expect((data?.["featureList"] as string[]).length).toBeGreaterThan(0)
    expect(buildStructuredData("home", "en")?.["url"]).toBe(`${SITE_ORIGIN}/en/`)
  })

  it("mirrors the visible pricing FAQ order and answers", () => {
    const data = buildStructuredData("pricing", "zh-CN")
    expect(data?.["@type"]).toBe("FAQPage")
    const questions = data?.["mainEntity"] as ReadonlyArray<{ name: string; acceptedAnswer: { text: string } }>
    expect(questions).toHaveLength(5)
    expect(questions[0]?.name).toBe(zh["pricing.faq.q1"])
    expect(questions[1]?.name).toBe(zh["pricing.faq.q5"])
    expect(questions[0]?.acceptedAnswer.text).toBe(zh["pricing.faq.a1"])
  })

  it("walks the three developer steps as a HowTo", () => {
    const data = buildStructuredData("developers", "en")
    expect(data?.["@type"]).toBe("HowTo")
    const steps = data?.["step"] as ReadonlyArray<{ name: string }>
    expect(steps).toHaveLength(3)
    expect(steps[0]?.name).toBe(en["dev.step1"])
    expect(steps[2]?.name).toBe(en["dev.step3"])
  })

  it("emits nothing for the legal and not-found pages", () => {
    expect(buildStructuredData("terms", "zh-CN")).toBeNull()
    expect(buildStructuredData("privacy", "zh-CN")).toBeNull()
    expect(buildStructuredData("notFound", "zh-CN")).toBeNull()
  })
})

describe("json-ld rendering", () => {
  it("serializes to one script tag and neutralizes embedded markup", () => {
    const payload: JsonLd = { value: "</script><script>alert(1)</script>" }
    const script = renderJsonLd(payload)
    expect(script.startsWith('<script type="application/ld+json">')).toBe(true)
    expect(script.endsWith("</script>")).toBe(true)
    expect(script.match(/<\/script>/g)).toHaveLength(1)
    expect(script).toContain("\\u003c/script>")
  })
})

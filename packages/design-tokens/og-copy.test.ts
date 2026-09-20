import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { ogLocales, type OgLocaleCopy } from "./og-copy.ts"

const banned = [
  /减半/,
  /省一半/,
  /砍半/,
  /削掉一半/,
  /缩小一半/,
  /一半以上/,
  /无差别/,
  /肉眼无差/,
  /\bhalve(s|d)?\b/i,
  /\bhalf the size\b/i,
  /\bhalf or more\b/i,
  /\bno visible difference\b/i,
]

const copyValues = (locale: OgLocaleCopy): string[] => [
  locale.mark,
  locale.eyebrow,
  locale.headline,
  locale.lede,
  ...locale.chips,
]

describe("og copy", () => {
  it("carries a Chinese and an English variant with every field filled", () => {
    expect(ogLocales.map((locale) => locale.lang)).toEqual(["zh-CN", "en"])
    expect(new Set(ogLocales.map((locale) => locale.file)).size).toBe(ogLocales.length)
    for (const locale of ogLocales) {
      for (const value of copyValues(locale)) expect(value.trim(), locale.lang).not.toBe("")
    }
  })

  it("never promises a saving the measurements do not support", () => {
    for (const locale of ogLocales) {
      for (const value of copyValues(locale)) {
        for (const pattern of banned) {
          expect(value, `${locale.lang} og copy must not overclaim a saving (${pattern})`).not.toMatch(pattern)
        }
      }
    }
  })

  it("scopes the saving claim to the formats that actually win", () => {
    for (const locale of ogLocales) {
      expect(locale.lede).toMatch(/收益最大|save the most/)
    }
  })

  it("keeps the render script reading the copy from this module", () => {
    const source = readFileSync(new URL("./render-og.ts", import.meta.url), "utf8")
    expect(source).toContain('from "./og-copy.ts"')
    for (const locale of ogLocales) {
      expect(source).not.toContain(locale.eyebrow)
      expect(source).not.toContain(locale.headline)
      expect(source).not.toContain(locale.lede)
    }
  })
})

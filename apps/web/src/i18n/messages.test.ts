import { describe, expect, it } from "vitest"
import { en } from "./locales/en.ts"
import { zhCN } from "./locales/zh-CN.ts"
import { messages, translate } from "./messages.ts"

const autonymAllowlist = new Set(["lang.zh"])
const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

const placeholders = (template: string): string[] =>
  Array.from(template.matchAll(/\{(\w+)\}/g), (match) => match[1] ?? "").sort()

describe("dictionaries", () => {
  it("cover exactly the same keys in both languages", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhCN).sort())
  })

  it("hold a non-empty value for every key", () => {
    for (const [key, value] of Object.entries(zhCN)) expect(value.trim(), key).not.toBe("")
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe("")
  })

  it("keep Chinese characters out of the English dictionary", () => {
    const offenders = Object.entries(en)
      .filter(([key, value]) => cjk.test(value) && !autonymAllowlist.has(key))
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })

  it("keep the brand name out of English copy and mark it as LubanPNG elsewhere", () => {
    expect(Object.values(en).some((value) => value.includes("LubanPNG"))).toBe(true)
  })

  it("use the same placeholders in both languages", () => {
    for (const key of Object.keys(zhCN) as Array<keyof typeof zhCN>) {
      expect(placeholders(en[key]), key).toEqual(placeholders(zhCN[key]))
    }
  })

  it("pair every plural variant with both categories", () => {
    for (const dictionary of [zhCN, en]) {
      for (const key of Object.keys(dictionary)) {
        if (key.endsWith(".one")) expect(dictionary).toHaveProperty(key.replace(/\.one$/, ".other"))
        if (key.endsWith(".other")) expect(dictionary).toHaveProperty(key.replace(/\.other$/, ".one"))
      }
    }
  })

  it("states the conversion caveat wherever the quota rule is explained", () => {
    const keys = ["pricing.faq.a1", "results.note.left", "dev.quota.body", "legal.terms.p3"] as const
    for (const key of keys) {
      expect(zhCN[key], `${key} zh`).toContain("保留原图")
      expect(zhCN[key], `${key} zh`).toContain("转换")
      expect(en[key], `${key} en`).toContain("the original is kept")
      expect(en[key], `${key} en`).toMatch(/convert/i)
    }
  })

  it("documents the quota_units and no_gain contract in the developer copy", () => {
    for (const dictionary of [zhCN, en]) {
      expect(dictionary["dev.quota.body"]).toContain("quota_units")
      expect(dictionary["dev.quota.body"]).toContain("no_gain")
    }
    expect(zhCN["dev.quota.body"]).toContain("预扣")
    expect(zhCN["dev.quota.body"]).toContain("实扣")
    expect(en["dev.quota.body"]).toContain("reserved")
    expect(en["dev.quota.body"]).toContain("charged")
  })

  it("documents the upscale limits and billing in the developer copy", () => {
    expect(zhCN["dev.upscale.billing"]).toContain("不计次")
    expect(zhCN["dev.upscale.billing"]).toContain("共用同一份额度")
    expect(en["dev.upscale.billing"]).toContain("never charged")
    expect(en["dev.upscale.billing"]).toContain("same pool")
    for (const value of [zhCN["dev.upscale.limits.sizeValue"], en["dev.upscale.limits.sizeValue"]]) {
      expect(value).toContain("20 MB")
    }
    for (const value of [zhCN["dev.upscale.limits.scaleValue"], en["dev.upscale.limits.scaleValue"]]) {
      expect(value).toContain("x2")
      expect(value).toContain("x4")
    }
  })

  it("explains upscale billing on the pricing page the same way the developer copy does", () => {
    const zhKeys = ["pricing.lede", "pricing.faq.a5", "dev.upscale.billing"] as const
    for (const key of zhKeys) {
      expect(zhCN[key], `${key} zh`).toContain("更小才计次")
      expect(zhCN[key], `${key} zh`).toContain("不计次")
    }
    expect(zhCN["pricing.faq.a5"]).toContain("共用同一份额度")
    expect(zhCN["meta.pricing.description"]).toContain("放大成功计 1 次")

    expect(en["pricing.lede"]).toContain("the \u201csmaller output\u201d rule does not apply to it")
    expect(en["pricing.lede"]).toContain("never charged")
    expect(en["pricing.faq.a5"]).toContain("the \u201csmaller output\u201d rule does not apply to it")
    expect(en["pricing.faq.a5"]).toContain("same quota as compression")
    expect(en["meta.pricing.description"]).toContain("a successful upscale costs 1 run")
  })

  it("keeps the planned agent channels marked as planned, not available", () => {
    expect(zhCN["dev.agents.mcpStatus"]).toBe("规划中")
    expect(zhCN["dev.agents.x402Status"]).toBe("规划中")
    expect(en["dev.agents.mcpStatus"]).toBe("Planned")
    expect(en["dev.agents.x402Status"]).toBe("Planned")
  })

  it("never promises a saving the measurements do not support", () => {
    const banned = [/\bhalf or more\b/i, /\bhalve(s|d)?\b/i, /削掉一半/, /缩小一半/, /一半以上/, /无差别/, /肉眼无差/, /no visible difference/i]
    for (const [locale, dictionary] of Object.entries(messages)) {
      for (const [key, value] of Object.entries(dictionary)) {
        for (const pattern of banned) {
          expect(value, `${locale} ${key} must not overclaim a saving (${pattern})`).not.toMatch(pattern)
        }
      }
    }
  })

  it("says per-format where the wins actually are", () => {
    for (const dictionary of [zhCN, en]) {
      expect(dictionary["home.lede.desktop"]).toMatch(/拍照|照片|screenshot|photo/i)
      expect(dictionary["home.lede.desktop"]).toMatch(/already-optimized|压过/i)
    }
  })

  it("keeps the English CLI samples in the order the CLI prints", () => {
    expect(en["teaser.cli.sample"]).toContain("saved 1.72 MB")
    expect(en["dev.cli.sample"]).toContain("saved 2.11 MB")
    expect(en["dev.cli.sample"]).toContain("used 7 / 50 this month")
    expect(en["teaser.cli.sample"]).not.toContain("MB saved")
    expect(en["dev.cli.sample"]).not.toContain("MB saved")
    expect(en["dev.cli.sample"]).not.toContain("/ 50 used")
  })
})

describe("translate", () => {
  it("interpolates named parameters", () => {
    expect(translate(zhCN, "quota.signIn", { count: 50 })).toBe("登录后每月 50 次")
    expect(translate(en, "quota.signIn", { count: 50 })).toBe("Sign in for 50 a month")
  })

  it("picks the English plural form from the count", () => {
    expect(translate(en, "results.batch", { count: 1 })).toBe("1 image")
    expect(translate(en, "results.batch", { count: 3 })).toBe("3 images")
    expect(translate(zhCN, "results.batch", { count: 3 })).toBe("本次 3 张")
  })

  it("leaves unknown placeholders untouched", () => {
    expect(translate(zhCN, "home.error.network", { count: 3 })).toBe("网络错误")
  })

  it("exposes a dictionary for every locale", () => {
    expect(messages["zh-CN"]).toBe(zhCN)
    expect(messages.en).toBe(en)
  })
})

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

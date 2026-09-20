import { describe, expect, it } from "vitest"
import { ApiClient } from "../src/api.js"
import { renderHelp } from "../src/help.js"
import { messages, resolveLang, translator } from "../src/i18n/messages.js"
import type { Io } from "../src/io.js"
import { run } from "../src/run.js"

const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

const placeholders = (template: string): string[] =>
  Array.from(template.matchAll(/\{(\w+)\}/g), (match) => match[1] ?? "").sort()

const collectingIo = (output: string[]): Io => ({
  write: (text) => {
    output.push(text)
  },
  writeError: (text) => {
    output.push(text)
  },
  promptSecret: async () => "",
})

const failingFetch = (() => Promise.reject(new Error("boom"))) as unknown as typeof fetch

describe("resolveLang", () => {
  it("prefers an explicit --lang over the environment", () => {
    expect(resolveLang(["--lang", "en"], { LANG: "zh_CN.UTF-8" })).toBe("en")
    expect(resolveLang(["--lang=zh"], { LANG: "en_US.UTF-8" })).toBe("zh")
    expect(resolveLang(["--lang", "zh-CN"], {})).toBe("zh")
  })

  it("reads LANG and LC_ALL, with LC_ALL taking precedence", () => {
    expect(resolveLang([], { LANG: "zh_CN.UTF-8" })).toBe("zh")
    expect(resolveLang([], { LANG: "en_GB.UTF-8" })).toBe("en")
    expect(resolveLang([], { LANG: "fr_FR.UTF-8" })).toBe("en")
    expect(resolveLang([], { LC_ALL: "zh_CN.UTF-8", LANG: "en_US.UTF-8" })).toBe("zh")
  })

  it("falls back to English when nothing is set", () => {
    expect(resolveLang([], {})).toBe("en")
    expect(resolveLang([], { LANG: "" })).toBe("en")
  })

  it("ignores --lang after --", () => {
    expect(resolveLang(["compress", "--", "--lang=en"], { LANG: "zh_CN" })).toBe("zh")
  })
})

describe("dictionaries", () => {
  it("cover exactly the same keys in both languages", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.zh).sort())
  })

  it("hold a non-empty value for every key", () => {
    for (const dictionary of [messages.zh, messages.en]) {
      for (const [key, value] of Object.entries(dictionary)) expect(value.trim(), key).not.toBe("")
    }
  })

  it("use the same placeholders in both languages", () => {
    for (const key of Object.keys(messages.zh) as Array<keyof typeof messages.zh>) {
      expect(placeholders(messages.en[key]), key).toEqual(placeholders(messages.zh[key]))
    }
  })

  it("keep Chinese characters out of the English dictionary", () => {
    const offenders = Object.entries(messages.en)
      .filter(([, value]) => cjk.test(value))
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })

  it("pair every plural variant with both categories", () => {
    for (const dictionary of [messages.zh, messages.en]) {
      for (const key of Object.keys(dictionary)) {
        if (key.endsWith(".one")) expect(dictionary).toHaveProperty(key.replace(/\.one$/, ".other"))
        if (key.endsWith(".other")) expect(dictionary).toHaveProperty(key.replace(/\.other$/, ".one"))
      }
    }
  })
})

describe("translator", () => {
  it("picks English plural forms and keeps Chinese invariant", () => {
    expect(translator("en")("summary.batch", { count: 1 })).toBe("1 image")
    expect(translator("en")("summary.batch", { count: 3 })).toBe("3 images")
    expect(translator("en")("quota.remaining.day", { count: 1 })).toBe("1 run left today")
    expect(translator("zh")("summary.batch", { count: 3 })).toBe("本次 3 张")
  })
})

describe("localized output", () => {
  it("renders help in both languages", () => {
    const en = renderHelp(translator("en"))
    expect(en).toContain("Usage:")
    expect(en).toContain("--lang <zh|en>")
    expect(en).not.toMatch(cjk)
    const zh = renderHelp(translator("zh"))
    expect(zh).toContain("用法：")
    expect(zh).toContain("--lang <zh|en>")
  })

  it("honours --lang and the LANG/LC_ALL fallbacks end to end", async () => {
    const flagged: string[] = []
    expect(await run(["--lang", "zh", "--help"], { env: {}, io: collectingIo(flagged) })).toBe(0)
    expect(flagged.join("")).toContain("用法：")

    const fromEnv: string[] = []
    expect(await run(["--help"], { env: { LANG: "zh_CN.UTF-8" }, io: collectingIo(fromEnv) })).toBe(0)
    expect(fromEnv.join("")).toContain("用法：")

    const fallback: string[] = []
    expect(await run(["--help"], { env: {}, io: collectingIo(fallback) })).toBe(0)
    expect(fallback.join("")).toContain("Usage:")
  })

  it("renders parameter errors and unknown commands in both languages", async () => {
    const en: string[] = []
    expect(await run(["compress", "a.png", "--concurrency", "0"], { env: {}, io: collectingIo(en) })).toBe(2)
    expect(en.join("")).toContain("--concurrency must be a positive integer")
    expect(en.join("")).toContain("Run lubanpng --help for usage")

    const zh: string[] = []
    expect(await run(["frobnicate"], { env: { LANG: "zh_CN.UTF-8" }, io: collectingIo(zh) })).toBe(2)
    expect(zh.join("")).toContain("未知命令：frobnicate")
    expect(zh.join("")).toContain("运行 lubanpng --help 查看用法")
  })

  it("renders network errors in both languages", async () => {
    const enClient = new ApiClient({ baseUrl: "http://127.0.0.1:1", lang: "en", fetchImpl: failingFetch })
    await expect(enClient.me()).rejects.toThrow("Network error — cannot reach the LubanPNG service")
    const zhClient = new ApiClient({ baseUrl: "http://127.0.0.1:1", lang: "zh", fetchImpl: failingFetch })
    await expect(zhClient.me()).rejects.toThrow("网络错误，无法连接 LubanPNG 服务")
  })
})

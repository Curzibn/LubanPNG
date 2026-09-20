import { afterAll, describe, expect, it, vi } from "vitest"
import {
  acceptLanguage,
  detectBrowserLocale,
  initialRedirectTarget,
  isEnglishPath,
  localeFromPath,
  localizedPath,
  parseStoredLocale,
  requestLocale,
  stripLocalePrefix,
  switchLocaleHref,
} from "./locale.ts"

describe("localeFromPath", () => {
  it("maps the /en prefix to English and everything else to Chinese", () => {
    expect(localeFromPath("/")).toBe("zh-CN")
    expect(localeFromPath("/pricing")).toBe("zh-CN")
    expect(localeFromPath("/en")).toBe("en")
    expect(localeFromPath("/en/")).toBe("en")
    expect(localeFromPath("/en/pricing")).toBe("en")
  })

  it("does not treat paths that merely start with the letters en as English", () => {
    expect(localeFromPath("/energy")).toBe("zh-CN")
    expect(localeFromPath("/enigma")).toBe("zh-CN")
    expect(isEnglishPath("/energy")).toBe(false)
  })
})

describe("stripLocalePrefix", () => {
  it("returns the Chinese form of a path", () => {
    expect(stripLocalePrefix("/en")).toBe("/")
    expect(stripLocalePrefix("/en/")).toBe("/")
    expect(stripLocalePrefix("/en/developers")).toBe("/developers")
    expect(stripLocalePrefix("/en/developers#cli")).toBe("/developers#cli")
    expect(stripLocalePrefix("/pricing")).toBe("/pricing")
  })
})

describe("localizedPath", () => {
  it("keeps Chinese paths unchanged and prefixes English ones", () => {
    expect(localizedPath("/", "zh-CN")).toBe("/")
    expect(localizedPath("/pricing", "zh-CN")).toBe("/pricing")
    expect(localizedPath("/", "en")).toBe("/en/")
    expect(localizedPath("/pricing", "en")).toBe("/en/pricing")
  })

  it("is idempotent for paths that already carry the prefix", () => {
    expect(localizedPath("/en/pricing", "en")).toBe("/en/pricing")
    expect(localizedPath("/en/pricing", "zh-CN")).toBe("/pricing")
    expect(localizedPath("/en/developers#cli", "en")).toBe("/en/developers#cli")
  })
})

describe("switchLocaleHref", () => {
  it("keeps the path, query and hash while swapping the locale", () => {
    expect(switchLocaleHref("/developers", "", "#cli", "en")).toBe("/en/developers#cli")
    expect(switchLocaleHref("/en/developers", "", "#cli", "zh-CN")).toBe("/developers#cli")
    expect(switchLocaleHref("/", "?utm_source=hn", "", "en")).toBe("/en/?utm_source=hn")
  })

  it("localizes the login next parameter together with the path", () => {
    expect(switchLocaleHref("/login", "?next=%2Fdashboard", "", "en")).toBe("/en/login?next=%2Fen%2Fdashboard")
    expect(switchLocaleHref("/en/login", "?next=%2Fen%2Fdashboard", "", "zh-CN")).toBe("/login?next=%2Fdashboard")
  })

  it("collapses repeated slashes so switcher hrefs stay site-internal", () => {
    expect(stripLocalePrefix("/en//evil.com/")).toBe("/evil.com/")
    expect(switchLocaleHref("/en//evil.com/", "", "", "zh-CN")).toBe("/evil.com/")
    expect(switchLocaleHref("//evil.com/", "", "", "en")).toBe("/en/evil.com/")
  })
})

describe("parseStoredLocale", () => {
  it("accepts only the supported locales", () => {
    expect(parseStoredLocale("zh-CN")).toBe("zh-CN")
    expect(parseStoredLocale("en")).toBe("en")
    expect(parseStoredLocale("fr")).toBeNull()
    expect(parseStoredLocale(null)).toBeNull()
  })
})

describe("detectBrowserLocale", () => {
  it("picks Chinese when any preferred language is Chinese", () => {
    expect(detectBrowserLocale(["zh-CN", "en-US"])).toBe("zh-CN")
    expect(detectBrowserLocale(["en-US", "zh-Hans"])).toBe("zh-CN")
  })

  it("falls back to English for every other browser language", () => {
    expect(detectBrowserLocale(["en-US"])).toBe("en")
    expect(detectBrowserLocale(["ja-JP"])).toBe("en")
    expect(detectBrowserLocale([])).toBe("en")
  })
})

describe("initialRedirectTarget", () => {
  const base = { pathname: "/", search: "", hash: "", stored: null, languages: ["en-US"] }

  it("sends a first-time non-Chinese visitor to the English site", () => {
    expect(initialRedirectTarget(base)).toBe("/en/")
    expect(initialRedirectTarget({ ...base, pathname: "/pricing", search: "?utm_source=hn" })).toBe("/en/pricing?utm_source=hn")
  })

  it("leaves Chinese browsers and stored preferences alone", () => {
    expect(initialRedirectTarget({ ...base, languages: ["zh-CN"] })).toBeNull()
    expect(initialRedirectTarget({ ...base, stored: "zh-CN" })).toBeNull()
    expect(initialRedirectTarget({ ...base, stored: "en" })).toBeNull()
  })

  it("does not redirect away from the English site", () => {
    expect(initialRedirectTarget({ ...base, pathname: "/en/pricing" })).toBeNull()
  })
})

describe("acceptLanguage", () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it("defaults to Chinese outside the browser", () => {
    expect(acceptLanguage()).toBe("zh-CN")
  })

  it("follows the language of the current URL", () => {
    vi.stubGlobal("window", { location: { pathname: "/en/pricing" } })
    expect(requestLocale()).toBe("en")
    expect(acceptLanguage()).toBe("en")
    vi.stubGlobal("window", { location: { pathname: "/pricing" } })
    expect(acceptLanguage()).toBe("zh-CN")
  })
})

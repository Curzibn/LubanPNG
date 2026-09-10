import { describe, expect, it } from "vitest"
import {
  compressedRatioPercent,
  formatBytes,
  formatIsoRelative,
  formatResetTime,
  formatSavings,
  formatShortDate,
  formatSizePair,
  formatUnixRelative,
  maskedKey,
  outputFileName,
  replaceExtension,
  savingsPercent,
} from "./format.ts"

describe("outputFileName", () => {
  it("swaps the extension when the product format differs", () => {
    expect(outputFileName("hero.png", "webp")).toBe("hero.webp")
    expect(outputFileName("scan.PNG", "jpeg")).toBe("scan.jpg")
    expect(outputFileName("archive.tar.gif", "avif")).toBe("archive.tar.avif")
    expect(replaceExtension("noext", "png")).toBe("noext.png")
  })

  it("keeps the original name when the family matches or the format is unknown", () => {
    expect(outputFileName("photo.jpeg", "jpeg")).toBe("photo.jpeg")
    expect(outputFileName("photo.JPG", "jpeg")).toBe("photo.JPG")
    expect(outputFileName("photo.png", null)).toBe("photo.png")
    expect(outputFileName("photo.png", "bmp")).toBe("photo.png")
  })
})

describe("formatBytes", () => {
  it("shows megabytes with two decimals", () => {
    expect(formatBytes(2516582)).toBe("2.40 MB")
    expect(formatBytes(1153434)).toBe("1.10 MB")
  })

  it("shows kilobytes as integers", () => {
    expect(formatBytes(319488)).toBe("312 KB")
    expect(formatBytes(98304)).toBe("96 KB")
  })

  it("shows bytes below one kilobyte", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(0)).toBe("0 B")
  })

  it("drops trailing zeros for plan limits", () => {
    expect(formatBytes(5 * 1024 * 1024, { trim: true })).toBe("5 MB")
    expect(formatBytes(25 * 1024 * 1024, { trim: true })).toBe("25 MB")
    expect(formatBytes(2516582, { trim: true })).toBe("2.4 MB")
  })
})

describe("formatSizePair", () => {
  it("keeps the compressed size in the unit of the original", () => {
    expect(formatSizePair(2516582, 933241)).toEqual({ original: "2.40 MB", compressed: "0.89 MB" })
    expect(formatSizePair(319488, 98304)).toEqual({ original: "312 KB", compressed: "96 KB" })
  })
})

describe("savingsPercent", () => {
  it("rounds the saved share to a whole percent", () => {
    expect(savingsPercent(2516582, 933241)).toBe(63)
    expect(savingsPercent(319488, 98304)).toBe(69)
    expect(savingsPercent(1153434, 744489)).toBe(35)
  })

  it("never reports negative savings", () => {
    expect(savingsPercent(100, 120)).toBe(0)
    expect(savingsPercent(0, 0)).toBe(0)
  })

  it("renders with a leading minus sign", () => {
    expect(formatSavings(63)).toBe("-63%")
  })
})

describe("compressedRatioPercent", () => {
  it("gives the bar width of the compressed file relative to the original", () => {
    expect(compressedRatioPercent(2516582, 933241)).toBe(37)
    expect(compressedRatioPercent(100, 250)).toBe(100)
    expect(compressedRatioPercent(0, 5)).toBe(0)
  })
})

describe("formatResetTime", () => {
  it("formats the reset instant in Asia/Shanghai", () => {
    expect(formatResetTime("2026-09-30T16:00:00Z")).toBe("10 月 1 日 00:00")
    expect(formatResetTime("2026-09-10T15:59:59Z")).toBe("9 月 10 日 23:59")
  })

  it("returns an empty string for an unparsable instant", () => {
    expect(formatResetTime("soon")).toBe("")
  })
})

describe("relative time", () => {
  const now = new Date("2026-09-10T06:12:00Z")
  const timeZone = "Asia/Shanghai"

  it("labels the same day as today", () => {
    expect(formatUnixRelative(1789020720, { now, timeZone })).toBe("今天 14:12")
  })

  it("labels the previous day as yesterday", () => {
    expect(formatIsoRelative("2026-09-09T13:39:00Z", { now, timeZone })).toBe("昨天 21:39")
  })

  it("falls back to a month-day stamp", () => {
    expect(formatIsoRelative("2026-09-02T02:05:00Z", { now, timeZone })).toBe("09-02 10:05")
    expect(formatShortDate("2026-09-02T02:05:00Z", timeZone)).toBe("09-02")
  })
})

describe("maskedKey", () => {
  it("joins prefix and suffix with an ellipsis", () => {
    expect(maskedKey("lp_live_a8f3", "k2q9")).toBe("lp_live_a8f3…k2q9")
  })
})

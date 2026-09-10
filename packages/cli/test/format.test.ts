import { describe, expect, it } from "vitest"
import {
  formatBytes,
  formatResetDate,
  formatSavings,
  formatSizePair,
  periodNoun,
  savingsPercent,
} from "../src/format.js"

describe("formatBytes", () => {
  it("matches the sizes shown in the site examples", () => {
    expect(formatBytes(2516582)).toBe("2.40 MB")
    expect(formatBytes(319488)).toBe("312 KB")
    expect(formatBytes(98304)).toBe("96 KB")
    expect(formatBytes(1153434)).toBe("1.10 MB")
    expect(formatBytes(512)).toBe("512 B")
  })

  it("keeps the compressed size in the unit of the original", () => {
    expect(formatSizePair(2516582, 933241)).toEqual({ original: "2.40 MB", compressed: "0.89 MB" })
    expect(formatSizePair(319488, 98304)).toEqual({ original: "312 KB", compressed: "96 KB" })
  })
})

describe("savings", () => {
  it("rounds the saved share and renders the sign", () => {
    expect(savingsPercent(2516582, 933241)).toBe(63)
    expect(formatSavings(63)).toBe("-63%")
    expect(savingsPercent(100, 120)).toBe(0)
  })
})

describe("reset date", () => {
  it("renders the reset instant in Asia/Shanghai", () => {
    expect(formatResetDate("2026-09-30T16:00:00Z")).toBe("10 月 1 日")
    expect(formatResetDate("soon")).toBe("")
  })
})

describe("periodNoun", () => {
  it("picks the right noun", () => {
    expect(periodNoun("day")).toBe("今日")
    expect(periodNoun("month")).toBe("本月")
  })
})

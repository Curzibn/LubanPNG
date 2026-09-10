import { describe, expect, it } from "vitest"
import {
  JPEG_FLATTEN_BACKGROUND,
  detectFormat,
  downloadableItems,
  effectiveTarget,
  outputNameFor,
  summarize,
  validateFiles,
  type CompressionItem,
} from "./compressorRules.ts"

const file = (name: string, size: number, type = ""): { name: string; size: number; type: string } => ({ name, size, type })

describe("detectFormat", () => {
  it("prefers the mime type and falls back to the extension", () => {
    expect(detectFormat("a.bin", "image/jpeg")).toBe("JPG")
    expect(detectFormat("logo@2x.PNG", "")).toBe("PNG")
    expect(detectFormat("sticker.gif", "application/octet-stream")).toBe("GIF")
    expect(detectFormat("shot.webp", "")).toBe("WEBP")
    expect(detectFormat("shot.bin", "image/avif")).toBe("AVIF")
    expect(detectFormat("notes.txt", "text/plain")).toBeNull()
    expect(detectFormat("IMG_0001.HEIC", "image/heic")).toBeNull()
  })
})

describe("JPEG_FLATTEN_BACKGROUND", () => {
  it("is a six digit lower-case hex colour", () => {
    expect(JPEG_FLATTEN_BACKGROUND).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe("effectiveTarget", () => {
  it("drops conversions that match the source family", () => {
    expect(effectiveTarget("PNG", "keep")).toBeNull()
    expect(effectiveTarget("PNG", "png")).toBeNull()
    expect(effectiveTarget("JPG", "jpeg")).toBeNull()
    expect(effectiveTarget("WEBP", "webp")).toBeNull()
    expect(effectiveTarget("PNG", "webp")).toBe("webp")
    expect(effectiveTarget("GIF", "png")).toBe("png")
    expect(effectiveTarget("AVIF", "jpeg")).toBe("jpeg")
  })
})

describe("validateFiles", () => {
  const limit = 5 * 1024 * 1024

  it("rejects unsupported formats and oversized files with a reason", () => {
    const result = validateFiles([file("a.png", 10, "image/png"), file("b.txt", 10), file("c.jpg", limit + 1)], limit)
    expect(result.accepted.map((f) => f.name)).toEqual(["a.png"])
    expect(result.rejected).toEqual([
      { name: "b.txt", reason: "只支持 PNG、JPEG、GIF、WebP、AVIF" },
      { name: "c.jpg", reason: "超过 5 MB 上限" },
    ])
    expect(result.truncated).toBe(false)
  })

  it("explains the HEIC path instead of the generic rejection", () => {
    const result = validateFiles([file("IMG_0001.HEIC", 10, ""), file("blob.bin", 10, "image/heif")], limit)
    expect(result.accepted).toEqual([])
    expect(result.rejected.map((entry) => entry.reason)).toEqual([
      "HEIC 暂不支持：iPhone 相册选图时 Safari 会自动转成 JPEG，其他设备请先导出为 JPEG",
      "HEIC 暂不支持：iPhone 相册选图时 Safari 会自动转成 JPEG，其他设备请先导出为 JPEG",
    ])
  })

  it("keeps only the first twenty accepted files per batch", () => {
    const files = Array.from({ length: 23 }, (_, i) => file(`img-${i}.png`, 100, "image/png"))
    const result = validateFiles(files, limit)
    expect(result.accepted).toHaveLength(20)
    expect(result.accepted[19]?.name).toBe("img-19.png")
    expect(result.truncated).toBe(true)
  })

  it("skips the size check while the plan limit is unknown", () => {
    const result = validateFiles([file("big.png", limit * 10, "image/png")], null)
    expect(result.accepted).toHaveLength(1)
  })
})

const item = (overrides: Partial<CompressionItem>): CompressionItem => ({
  id: "x",
  name: "x.png",
  format: "PNG",
  target: null,
  quotaUnits: 1,
  originalSize: 1000,
  stage: "completed",
  uploadRatio: 1,
  queuePosition: null,
  compressedSize: 400,
  compressedUrl: "/v1/images/download/x.png",
  error: null,
  ...overrides,
})

describe("summarize", () => {
  it("totals saved bytes and quota units over completed items only", () => {
    const summary = summarize([
      item({ id: "a", originalSize: 2000, compressedSize: 500 }),
      item({ id: "b", stage: "processing", compressedSize: null, target: "webp", quotaUnits: 2 }),
      item({ id: "c", stage: "failed", compressedSize: null }),
      item({ id: "d", originalSize: 1000, compressedSize: 300, target: "avif", quotaUnits: 2 }),
    ])
    expect(summary).toEqual({
      total: 4,
      completed: 2,
      originalBytes: 3000,
      compressedBytes: 800,
      savedBytes: 2200,
      quotaUnits: 3,
      inFlight: true,
    })
  })
})

describe("downloadableItems", () => {
  it("lists only completed items that have a compressed url, named after the product format", () => {
    const list = downloadableItems([
      item({ id: "a", name: "a.png", compressedUrl: "/a" }),
      item({ id: "b", name: "b.png", compressedUrl: null }),
      item({ id: "c", name: "c.png", stage: "failed" }),
      item({ id: "d", name: "d.png", target: "webp", compressedUrl: "/d" }),
    ])
    expect(list).toEqual([
      { name: "a.png", url: "/a" },
      { name: "d.webp", url: "/d" },
    ])
    expect(outputNameFor({ name: "cutout.png", target: "jpeg" })).toBe("cutout.jpg")
  })
})

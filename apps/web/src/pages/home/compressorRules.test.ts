import { describe, expect, it } from "vitest"
import { detectFormat, downloadableItems, summarize, validateFiles, type CompressionItem } from "./compressorRules.ts"

const file = (name: string, size: number, type = ""): { name: string; size: number; type: string } => ({ name, size, type })

describe("detectFormat", () => {
  it("prefers the mime type and falls back to the extension", () => {
    expect(detectFormat("a.bin", "image/jpeg")).toBe("JPG")
    expect(detectFormat("logo@2x.PNG", "")).toBe("PNG")
    expect(detectFormat("sticker.gif", "application/octet-stream")).toBe("GIF")
    expect(detectFormat("notes.txt", "text/plain")).toBeNull()
  })
})

describe("validateFiles", () => {
  const limit = 5 * 1024 * 1024

  it("rejects unsupported formats and oversized files with a reason", () => {
    const result = validateFiles([file("a.png", 10, "image/png"), file("b.txt", 10), file("c.jpg", limit + 1)], limit)
    expect(result.accepted.map((f) => f.name)).toEqual(["a.png"])
    expect(result.rejected).toEqual([
      { name: "b.txt", reason: "只支持 PNG、JPEG、GIF" },
      { name: "c.jpg", reason: "超过 5 MB 上限" },
    ])
    expect(result.truncated).toBe(false)
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
  it("totals saved bytes over completed items only", () => {
    const summary = summarize([
      item({ id: "a", originalSize: 2000, compressedSize: 500 }),
      item({ id: "b", stage: "processing", compressedSize: null }),
      item({ id: "c", stage: "failed", compressedSize: null }),
    ])
    expect(summary).toEqual({
      total: 3,
      completed: 1,
      originalBytes: 2000,
      compressedBytes: 500,
      savedBytes: 1500,
      inFlight: true,
    })
  })
})

describe("downloadableItems", () => {
  it("lists only completed items that have a compressed url", () => {
    const list = downloadableItems([
      item({ id: "a", name: "a.png", compressedUrl: "/a" }),
      item({ id: "b", name: "b.png", compressedUrl: null }),
      item({ id: "c", name: "c.png", stage: "failed" }),
    ])
    expect(list).toEqual([{ name: "a.png", url: "/a" }])
  })
})

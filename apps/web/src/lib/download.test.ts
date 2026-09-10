import { describe, expect, it } from "vitest"
import { downloadAllAsZip, uniqueNames, zipFileName } from "./download.ts"

describe("uniqueNames", () => {
  it("numbers repeated file names while keeping the extension", () => {
    expect(uniqueNames(["a.png", "b.jpg", "a.png", "a.png"])).toEqual(["a.png", "b.jpg", "a (2).png", "a (3).png"])
  })

  it("handles names without an extension", () => {
    expect(uniqueNames(["cover", "cover"])).toEqual(["cover", "cover (2)"])
  })
})

describe("zipFileName", () => {
  it("stamps the archive with the current instant", () => {
    expect(zipFileName(new Date("2026-09-10T06:12:30Z"))).toBe("lubanpng-20260910061230.zip")
  })
})

describe("downloadAllAsZip", () => {
  const items = [
    { name: "photo_banner.jpg", url: "/v1/images/download/compressed_1.jpg" },
    { name: "logo@2x.png", url: "/v1/images/download/compressed_2.png" },
  ]

  it("bundles every compressed file into one archive", async () => {
    const saved: string[] = []
    const opened: string[] = []
    const delivery = await downloadAllAsZip(items, {
      fetchBlob: async (url) => new Blob([url]),
      saveBlob: (blob, fileName) => {
        expect(blob.size).toBeGreaterThan(0)
        saved.push(fileName)
      },
      openLink: (url) => opened.push(url),
    })
    expect(delivery).toBe("zip")
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatch(/^lubanpng-\d{14}\.zip$/)
    expect(opened).toEqual([])
  })

  it("falls back to opening every link when a fetch fails", async () => {
    const opened: string[] = []
    const delivery = await downloadAllAsZip(items, {
      fetchBlob: async (url) => {
        if (url.endsWith(".png")) throw new Error("blocked")
        return new Blob(["ok"])
      },
      saveBlob: () => {
        throw new Error("should not save")
      },
      openLink: (url) => opened.push(url),
    })
    expect(delivery).toBe("links")
    expect(opened).toEqual(items.map((item) => item.url))
  })

  it("does nothing for an empty list", async () => {
    const delivery = await downloadAllAsZip([], {
      fetchBlob: async () => new Blob(),
      saveBlob: () => {},
      openLink: () => {},
    })
    expect(delivery).toBe("zip")
  })
})

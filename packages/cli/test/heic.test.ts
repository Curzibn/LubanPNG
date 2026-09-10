import { access, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { HEIC_UNSUPPORTED_MESSAGE, isHeicPath, prepareHeicUpload } from "../src/heic.js"

describe("isHeicPath", () => {
  it("matches heic and heif extensions case-insensitively", () => {
    expect(isHeicPath("/tmp/IMG_0001.HEIC")).toBe(true)
    expect(isHeicPath("/tmp/scan.heif")).toBe(true)
    expect(isHeicPath("/tmp/photo.jpg")).toBe(false)
    expect(isHeicPath("/tmp/heic")).toBe(false)
  })
})

describe("prepareHeicUpload", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "lubanpng-heic-test-"))
    await writeFile(join(root, "IMG_0001.HEIC"), new Uint8Array([1, 2, 3]))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("refuses to convert outside macOS", async () => {
    await expect(prepareHeicUpload(join(root, "IMG_0001.HEIC"), "linux")).rejects.toThrow(HEIC_UNSUPPORTED_MESSAGE)
    await expect(prepareHeicUpload(join(root, "IMG_0001.HEIC"), "win32")).rejects.toThrow(HEIC_UNSUPPORTED_MESSAGE)
  })

  it("runs the system converter into a temporary jpeg and cleans it up", async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const prepared = await prepareHeicUpload(join(root, "IMG_0001.HEIC"), "darwin", async (command, args) => {
      calls.push({ command, args })
      await writeFile(args[args.length - 1] as string, new Uint8Array([0xff, 0xd8]))
    })
    expect(prepared.name).toBe("IMG_0001.jpg")
    expect(prepared.path.endsWith("IMG_0001.jpg")).toBe(true)
    expect(calls[0]?.command).toBe("sips")
    expect(calls[0]?.args.slice(0, 3)).toEqual(["-s", "format", "jpeg"])
    expect(calls[0]?.args).toContain(join(root, "IMG_0001.HEIC"))
    await expect(access(prepared.path)).resolves.toBeUndefined()
    await prepared.cleanup()
    await expect(access(prepared.path)).rejects.toThrow()
  })

  it("wraps converter failures in a readable message", async () => {
    await expect(
      prepareHeicUpload(join(root, "IMG_0001.HEIC"), "darwin", async () => {
        throw new Error("sips exploded")
      }),
    ).rejects.toThrow(/HEIC 转换失败：sips exploded/)
  })
})

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { collectFiles, compressCommand, outputExtensionFor } from "../src/commands/compress.js"
import type { Context } from "../src/context.js"
import { UsageError } from "../src/errors.js"
import type { Io } from "../src/io.js"
import { startMockServer, type MockServer } from "./mockServer.js"

const COMPRESSED = new Uint8Array([9, 9])
const LARGER_THAN_SOURCE = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

const collectingIo = (output: string[]): Io => ({
  write: (text) => {
    output.push(text)
  },
  writeError: (text) => {
    output.push(text)
  },
  promptSecret: async () => "",
})

describe("collectFiles", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "lubanpng-collect-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("requires --recursive for directories", async () => {
    await mkdir(join(root, "images"))
    await expect(collectFiles([join(root, "images")], false)).rejects.toThrow(UsageError)
  })

  it("collects image files recursively and skips other files", async () => {
    await mkdir(join(root, "images", "nested"), { recursive: true })
    await writeFile(join(root, "images", "a.png"), "a")
    await writeFile(join(root, "images", "nested", "b.JPG"), "b")
    await writeFile(join(root, "images", "nested", "c.webp"), "c")
    await writeFile(join(root, "images", "d.avif"), "d")
    await writeFile(join(root, "images", "e.HEIC"), "e")
    await writeFile(join(root, "images", "notes.txt"), "n")
    const files = await collectFiles([join(root, "images")], true)
    expect(files.map((file) => file.relative).sort()).toEqual([
      "a.png",
      "d.avif",
      "e.HEIC",
      join("nested", "b.JPG"),
      join("nested", "c.webp"),
    ])
  })

  it("rejects missing paths", async () => {
    await expect(collectFiles([join(root, "nope.png")], false)).rejects.toThrow(/路径不存在/)
  })
})

describe("compressCommand", () => {
  let server: MockServer
  let growingServer: MockServer
  let root: string

  beforeAll(async () => {
    server = await startMockServer(COMPRESSED)
    growingServer = await startMockServer(LARGER_THAN_SOURCE)
  })

  afterAll(async () => {
    await server.close()
    await growingServer.close()
  })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "lubanpng-compress-"))
    await mkdir(join(root, "images"))
    await writeFile(join(root, "images", "photo.png"), new Uint8Array([1, 2, 3, 4]))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const context = (output: string[]): Context => ({
    apiBase: server.baseUrl,
    env: { LUBANPNG_API_KEY: "lp_test_key" },
    io: collectingIo(output),
  })

  it("writes into --out keeping the input layout and prints the summary", async () => {
    const output: string[] = []
    const code = await compressCommand(context(output), {
      paths: [join(root, "images")],
      out: join(root, "dist"),
      inPlace: false,
      recursive: true,
      concurrency: 2,
    })
    expect(code).toBe(0)
    const saved = await readFile(join(root, "dist", "photo.png"))
    expect(Array.from(saved)).toEqual([9, 9])
    const text = output.join("")
    expect(text).toContain("photo.png")
    expect(text).toContain("-50%")
    expect(text).toContain("本次 1 张")
    expect(text).toContain("本月剩余 46 次")
  })

  it("overwrites the original with --in-place through an atomic rename", async () => {
    const output: string[] = []
    const code = await compressCommand(context(output), {
      paths: [join(root, "images", "photo.png")],
      out: undefined,
      inPlace: true,
      recursive: false,
      concurrency: 1,
    })
    expect(code).toBe(0)
    const saved = await readFile(join(root, "images", "photo.png"))
    expect(Array.from(saved)).toEqual([9, 9])
    const leftovers = (await readdir(join(root, "images"))).filter((name) => name.includes("lubanpng-"))
    expect(leftovers).toEqual([])
  })

  it("keeps the original when the product is not smaller", async () => {
    const output: string[] = []
    const code = await compressCommand(
      { apiBase: growingServer.baseUrl, env: { LUBANPNG_API_KEY: "lp_test_key" }, io: collectingIo(output) },
      {
        paths: [join(root, "images", "photo.png")],
        out: undefined,
        inPlace: true,
        recursive: false,
        concurrency: 1,
      },
    )
    expect(code).toBe(0)
    const saved = await readFile(join(root, "images", "photo.png"))
    expect(Array.from(saved)).toEqual([1, 2, 3, 4])
    const text = output.join("")
    expect(text).toContain("无收益，保留原图（不计次）")
    expect(text).toContain("1 张无收益保留原图（不计次）")
  })

  it("rejects --out collisions from same-named inputs", async () => {
    await mkdir(join(root, "other"))
    await writeFile(join(root, "other", "photo.png"), new Uint8Array([5, 6, 7, 8]))
    const output: string[] = []
    await expect(
      compressCommand(context(output), {
        paths: [join(root, "images"), join(root, "other")],
        out: join(root, "dist"),
        inPlace: false,
        recursive: true,
        concurrency: 2,
      }),
    ).rejects.toThrow(/输出路径冲突/)
  })

  it("writes converted products with the target extension and reports them", async () => {
    const output: string[] = []
    const code = await compressCommand(context(output), {
      paths: [join(root, "images", "photo.png")],
      out: join(root, "dist"),
      inPlace: false,
      recursive: false,
      concurrency: 1,
      convert: "webp",
    })
    expect(code).toBe(0)
    const saved = await readFile(join(root, "dist", "photo.webp"))
    expect(Array.from(saved)).toEqual([9, 9])
    const upload = server.requests.filter((request) => request.url === "/v1/images/compress").at(-1)
    expect(upload?.body).toContain('name="convert"')
    expect(upload?.body).toContain("webp")
    const text = output.join("")
    expect(text).toContain("→ photo.webp")
    expect(text).toContain("1 张已转换")
  })

  it("refuses to overwrite a HEIC source in place and counts it as failed", async () => {
    await writeFile(join(root, "images", "IMG_0002.heic"), new Uint8Array([1, 2, 3]))
    const output: string[] = []
    const code = await compressCommand(context(output), {
      paths: [join(root, "images", "IMG_0002.heic")],
      out: undefined,
      inPlace: true,
      recursive: false,
      concurrency: 1,
    })
    expect(code).toBe(1)
    const text = output.join("")
    expect(text).toContain("不能就地覆盖")
    const untouched = await readFile(join(root, "images", "IMG_0002.heic"))
    expect(Array.from(untouched)).toEqual([1, 2, 3])
  })

  it("keeps the source extension when the target is the same family", () => {
    expect(outputExtensionFor("/tmp/a.png", "webp")).toBe(".webp")
    expect(outputExtensionFor("/tmp/a.jpeg", "jpeg")).toBe(".jpeg")
    expect(outputExtensionFor("/tmp/a.JPG", "jpeg")).toBe(".JPG")
    expect(outputExtensionFor("/tmp/a.png", "png")).toBe(".png")
    expect(outputExtensionFor("/tmp/a.png", null)).toBe(".png")
    expect(outputExtensionFor("/tmp/a.gif", "avif")).toBe(".avif")
  })

  it("fails fast when no key is configured", async () => {
    const output: string[] = []
    await expect(
      compressCommand(
        { apiBase: server.baseUrl, env: {}, io: collectingIo(output) },
        { paths: [join(root, "images", "photo.png")], out: undefined, inPlace: false, recursive: false, concurrency: 1 },
      ),
    ).rejects.toThrow(/未登录/)
  })
})

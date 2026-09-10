import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { collectFiles, compressCommand } from "../src/commands/compress.js"
import type { Context } from "../src/context.js"
import { UsageError } from "../src/errors.js"
import type { Io } from "../src/io.js"
import { startMockServer, type MockServer } from "./mockServer.js"

const COMPRESSED = new Uint8Array([9, 9])

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
    await writeFile(join(root, "images", "notes.txt"), "n")
    const files = await collectFiles([join(root, "images")], true)
    expect(files.map((file) => file.relative).sort()).toEqual(["a.png", join("nested", "b.JPG")])
  })

  it("rejects missing paths", async () => {
    await expect(collectFiles([join(root, "nope.png")], false)).rejects.toThrow(/路径不存在/)
  })
})

describe("compressCommand", () => {
  let server: MockServer
  let root: string

  beforeAll(async () => {
    server = await startMockServer(COMPRESSED)
  })

  afterAll(async () => {
    await server.close()
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

  it("overwrites the original with --in-place", async () => {
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

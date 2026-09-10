import { describe, expect, it } from "vitest"
import { DEFAULT_CONCURRENCY, parseArgv } from "../src/args.js"
import { UsageError } from "../src/errors.js"

describe("parseArgv", () => {
  it("parses login, logout and usage", () => {
    expect(parseArgv(["login"])).toEqual({ command: "login", apiBase: undefined })
    expect(parseArgv(["logout"])).toEqual({ command: "logout", apiBase: undefined })
    expect(parseArgv(["usage"])).toEqual({ command: "usage", apiBase: undefined })
  })

  it("resolves the help and version short circuits", () => {
    expect(parseArgv(["--help"]).command).toBe("help")
    expect(parseArgv(["-h"]).command).toBe("help")
    expect(parseArgv(["--version"]).command).toBe("version")
    expect(parseArgv(["-v"]).command).toBe("version")
  })

  it("collects compress paths, flags and options", () => {
    expect(parseArgv(["compress", "./a.png", "./b.jpg", "--out", "./dist", "--recursive"])).toEqual({
      command: "compress",
      apiBase: undefined,
      paths: ["./a.png", "./b.jpg"],
      out: "./dist",
      inPlace: false,
      recursive: true,
      concurrency: DEFAULT_CONCURRENCY,
      convert: undefined,
      background: undefined,
    })
  })

  it("accepts --option=value and options before the command", () => {
    expect(parseArgv(["--api-base=https://example.test", "compress", "--concurrency=8", "a.png"])).toEqual({
      command: "compress",
      apiBase: "https://example.test",
      paths: ["a.png"],
      out: undefined,
      inPlace: false,
      recursive: false,
      concurrency: 8,
      convert: undefined,
      background: undefined,
    })
  })

  it("parses conversion targets and background colours", () => {
    const webp = parseArgv(["compress", "a.png", "--convert", "WebP"])
    expect(webp.command === "compress" && webp.convert).toBe("webp")
    const jpeg = parseArgv(["compress", "a.png", "--convert=jpg", "--background", "FFcc00"])
    expect(jpeg.command === "compress" && jpeg.convert).toBe("jpeg")
    expect(jpeg.command === "compress" && jpeg.background).toBe("#ffcc00")
  })

  it("rejects invalid or conflicting conversion options", () => {
    expect(() => parseArgv(["compress", "a.png", "--convert", "gif"])).toThrow(/只支持 png、jpeg、webp、avif/)
    expect(() => parseArgv(["compress", "a.png", "--convert", "jpeg", "--background", "white"])).toThrow(/#RRGGBB/)
    expect(() => parseArgv(["compress", "a.png", "--convert", "webp", "--in-place"])).toThrow(/不能与 --convert/)
    expect(() => parseArgv(["compress", "a.png", "--background", "#ffffff"])).toThrow(/需要与 --convert/)
  })

  it("treats tokens after -- as paths", () => {
    const parsed = parseArgv(["compress", "--", "--weird-name.png"])
    expect(parsed.command).toBe("compress")
    if (parsed.command === "compress") expect(parsed.paths).toEqual(["--weird-name.png"])
  })

  it("rejects a missing command", () => {
    expect(() => parseArgv(["--recursive"])).toThrow(UsageError)
    expect(() => parseArgv(["--recursive"])).toThrow(/缺少子命令/)
  })

  it("rejects unknown commands and options", () => {
    expect(() => parseArgv(["frobnicate"])).toThrow(/未知命令/)
    expect(() => parseArgv(["compress", "--turbo", "a.png"])).toThrow(/未知选项/)
  })

  it("rejects an empty compress invocation", () => {
    expect(() => parseArgv(["compress", "--out", "./dist"])).toThrow(/至少需要一个/)
  })

  it("rejects conflicting or invalid compress options", () => {
    expect(() => parseArgv(["compress", "a.png", "--in-place", "--out", "./d"])).toThrow(/不能同时使用/)
    expect(() => parseArgv(["compress", "a.png", "--concurrency", "0"])).toThrow(/正整数/)
    expect(() => parseArgv(["compress", "a.png", "--concurrency", "many"])).toThrow(/正整数/)
    expect(() => parseArgv(["compress", "a.png", "--concurrency", "17"])).toThrow(/最大 16/)
    expect(() => parseArgv(["compress", "a.png", "--out"])).toThrow(/缺少值/)
  })

  it("accepts the concurrency ceiling", () => {
    const parsed = parseArgv(["compress", "a.png", "--concurrency", "16"])
    expect(parsed.command).toBe("compress")
    if (parsed.command === "compress") expect(parsed.concurrency).toBe(16)
  })

  it("rejects trailing arguments on single-argument commands", () => {
    expect(() => parseArgv(["usage", "extra"])).toThrow(/多余参数/)
  })
})

import { describe, expect, it } from "vitest"
import { DEFAULT_CONCURRENCY, parseArgv } from "../src/args.js"
import { UsageError } from "../src/errors.js"

describe("parseArgv", () => {
  it("parses login, logout and usage", () => {
    expect(parseArgv(["login"], "zh")).toEqual({ command: "login", apiBase: undefined })
    expect(parseArgv(["logout"], "zh")).toEqual({ command: "logout", apiBase: undefined })
    expect(parseArgv(["usage"], "zh")).toEqual({ command: "usage", apiBase: undefined })
  })

  it("resolves the help and version short circuits", () => {
    expect(parseArgv(["--help"], "zh").command).toBe("help")
    expect(parseArgv(["-h"], "zh").command).toBe("help")
    expect(parseArgv(["--version"], "zh").command).toBe("version")
    expect(parseArgv(["-v"], "zh").command).toBe("version")
  })

  it("collects compress paths, flags and options", () => {
    expect(parseArgv(["compress", "./a.png", "./b.jpg", "--out", "./dist", "--recursive"], "zh")).toEqual({
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
    expect(parseArgv(["--api-base=https://example.test", "compress", "--concurrency=8", "a.png"], "zh")).toEqual({
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
    const webp = parseArgv(["compress", "a.png", "--convert", "WebP"], "zh")
    expect(webp.command === "compress" && webp.convert).toBe("webp")
    const jpeg = parseArgv(["compress", "a.png", "--convert=jpg", "--background", "FFcc00"], "zh")
    expect(jpeg.command === "compress" && jpeg.convert).toBe("jpeg")
    expect(jpeg.command === "compress" && jpeg.background).toBe("#ffcc00")
  })

  it("accepts --lang anywhere before -- and consumes its value", () => {
    expect(parseArgv(["--lang", "en", "login"], "zh").command).toBe("login")
    expect(parseArgv(["compress", "a.png", "--lang=zh"], "zh").command).toBe("compress")
    expect(() => parseArgv(["--lang"], "zh")).toThrow(/缺少值/)
    const parsed = parseArgv(["compress", "--", "--lang=zh"], "zh")
    expect(parsed.command).toBe("compress")
    if (parsed.command === "compress") expect(parsed.paths).toEqual(["--lang=zh"])
  })

  it("rejects invalid or conflicting conversion options", () => {
    expect(() => parseArgv(["compress", "a.png", "--convert", "gif"], "zh")).toThrow(/只支持 png、jpeg、webp、avif/)
    expect(() => parseArgv(["compress", "a.png", "--convert", "jpeg", "--background", "white"], "zh")).toThrow(/#RRGGBB/)
    expect(() => parseArgv(["compress", "a.png", "--convert", "webp", "--in-place"], "zh")).toThrow(/不能与 --convert/)
    expect(() => parseArgv(["compress", "a.png", "--background", "#ffffff"], "zh")).toThrow(/需要与 --convert/)
  })

  it("treats tokens after -- as paths", () => {
    const parsed = parseArgv(["compress", "--", "--weird-name.png"], "zh")
    expect(parsed.command).toBe("compress")
    if (parsed.command === "compress") expect(parsed.paths).toEqual(["--weird-name.png"])
  })

  it("rejects a missing command", () => {
    expect(() => parseArgv(["--recursive"], "zh")).toThrow(UsageError)
    expect(() => parseArgv(["--recursive"], "zh")).toThrow(/缺少子命令/)
  })

  it("rejects unknown commands and options", () => {
    expect(() => parseArgv(["frobnicate"], "zh")).toThrow(/未知命令/)
    expect(() => parseArgv(["compress", "--turbo", "a.png"], "zh")).toThrow(/未知选项/)
  })

  it("rejects an empty compress invocation", () => {
    expect(() => parseArgv(["compress", "--out", "./dist"], "zh")).toThrow(/至少需要一个/)
  })

  it("rejects conflicting or invalid compress options", () => {
    expect(() => parseArgv(["compress", "a.png", "--in-place", "--out", "./d"], "zh")).toThrow(/不能同时使用/)
    expect(() => parseArgv(["compress", "a.png", "--concurrency", "0"], "zh")).toThrow(/正整数/)
    expect(() => parseArgv(["compress", "a.png", "--concurrency", "many"], "zh")).toThrow(/正整数/)
    expect(() => parseArgv(["compress", "a.png", "--concurrency", "17"], "zh")).toThrow(/最大 16/)
    expect(() => parseArgv(["compress", "a.png", "--out"], "zh")).toThrow(/缺少值/)
  })

  it("accepts the concurrency ceiling", () => {
    const parsed = parseArgv(["compress", "a.png", "--concurrency", "16"], "zh")
    expect(parsed.command).toBe("compress")
    if (parsed.command === "compress") expect(parsed.concurrency).toBe(16)
  })

  it("rejects trailing arguments on single-argument commands", () => {
    expect(() => parseArgv(["usage", "extra"], "zh")).toThrow(/多余参数/)
  })

  it("renders usage errors in the requested language", () => {
    expect(() => parseArgv(["compress", "a.png", "--concurrency", "0"], "en")).toThrow(/must be a positive integer/)
    expect(() => parseArgv(["compress", "a.png", "--concurrency", "0"], "zh")).toThrow(/必须是正整数/)
    expect(() => parseArgv(["frobnicate"], "en")).toThrow(/Unknown command: frobnicate/)
    expect(() => parseArgv(["frobnicate"], "zh")).toThrow(/未知命令：frobnicate/)
  })
})

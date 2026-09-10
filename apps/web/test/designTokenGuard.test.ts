import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src")
const scannedExtensions = new Set([".ts", ".tsx", ".css"])

const collectFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return collectFiles(path)
    const dot = entry.lastIndexOf(".")
    return dot >= 0 && scannedExtensions.has(entry.slice(dot)) ? [path] : []
  })

type Rule = { name: string; pattern: RegExp }

const tailwindPalette =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const colorUtilities =
  "bg|text|border|stroke|fill|from|to|via|ring|outline|decoration|accent|caret|divide|shadow|placeholder|inset-ring"

export const rules: Rule[] = [
  { name: "Tailwind arbitrary value", pattern: /\b[a-z][a-z0-9-]*-\[[^\]]+\]/g },
  { name: "Tailwind custom-property shorthand", pattern: /\b[a-z][a-z0-9-]*-\((?:--|length:|color:|number:)[^)]*\)/g },
  { name: "raw hex color", pattern: /#[0-9a-fA-F]{3,8}\b/g },
  { name: "px, rem or em literal", pattern: /(?<![\w.])\d+(?:\.\d+)?(?:px|rem|em)\b/g },
  {
    name: "Tailwind default palette color",
    pattern: new RegExp(`\\b(?:${colorUtilities})-(?:(?:${tailwindPalette})-\\d{2,3}|black|white)\\b`, "g"),
  },
]

export const findViolations = (source: string): Array<{ rule: string; match: string }> =>
  rules.flatMap((rule) =>
    Array.from(source.matchAll(rule.pattern), (found) => ({ rule: rule.name, match: found[0] })),
  )

describe("design token guard", () => {
  const files = collectFiles(sourceRoot)

  it("scans the application sources", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it("keeps every visual value in the token layer", () => {
    const report = files.flatMap((file) =>
      findViolations(readFileSync(file, "utf8")).map(
        (violation) => `${relative(sourceRoot, file)}: ${violation.rule} → ${violation.match}`,
      ),
    )
    expect(report).toEqual([])
  })

  it("recognises each forbidden pattern", () => {
    expect(findViolations('className="w-[123px] text-[#abc]"').map((v) => v.rule)).toEqual([
      "Tailwind arbitrary value",
      "Tailwind arbitrary value",
      "raw hex color",
      "px, rem or em literal",
    ])
    expect(findViolations("color: #C8401B;").map((v) => v.rule)).toEqual(["raw hex color"])
    expect(findViolations("padding: 7px 1.5rem 0.5em;").map((v) => v.match)).toEqual(["7px", "1.5rem", "0.5em"])
    expect(findViolations('className="bg-gray-100 text-red-500 border-white"').map((v) => v.match)).toEqual([
      "bg-gray-100",
      "text-red-500",
      "border-white",
    ])
    expect(findViolations('className="bg-(--my-color) border-(length:--w)"').map((v) => v.rule)).toEqual([
      "Tailwind custom-property shorthand",
      "Tailwind custom-property shorthand",
    ])
  })

  it("allows token-driven utilities, zero values and runtime percentages", () => {
    expect(
      findViolations(
        'className="bg-paper text-ink border-hairline border-frame h-control rounded-card text-amber gap-2.5 p-0"',
      ),
    ).toEqual([])
    expect(findViolations("style={{ width: `${ratio}%` }}")).toEqual([])
    expect(findViolations("outline-offset: --spacing(0.5); width: var(--container-page);")).toEqual([])
    expect(findViolations('<a href="/developers#cli">')).toEqual([])
  })
})

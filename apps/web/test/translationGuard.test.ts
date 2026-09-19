import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src")

const collectFiles = (dir: string, extension: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return collectFiles(path, extension)
    return entry.endsWith(extension) ? [path] : []
  })

export const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

describe("translation guard", () => {
  const components = collectFiles(sourceRoot, ".tsx").filter((file) => !file.endsWith(".test.tsx"))

  it("scans the rendered component sources", () => {
    expect(components.length).toBeGreaterThan(10)
  })

  it("keeps every user-facing string in the dictionaries", () => {
    const offenders = components
      .filter((file) => cjk.test(readFileSync(file, "utf8")))
      .map((file) => relative(sourceRoot, file))
    expect(offenders).toEqual([])
  })
})

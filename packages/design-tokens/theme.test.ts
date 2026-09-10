import { describe, expect, it } from "vitest"
import { renderFavicon, renderTheme } from "./render.ts"
import { tokens } from "./tokens.ts"

describe("renderTheme", () => {
  const css = renderTheme()

  it("opens a static Tailwind theme block that resets the default theme", () => {
    expect(css.startsWith("@theme static {\n  --*: initial;")).toBe(true)
  })

  it("declares every color, font, radius and container token", () => {
    for (const [name, value] of Object.entries(tokens.color)) {
      expect(css).toContain(`--color-${name}: ${value};`)
    }
    for (const name of Object.keys(tokens.font)) {
      expect(css).toContain(`--font-${name}: `)
    }
    for (const [name, value] of Object.entries(tokens.radius)) {
      expect(css).toContain(`--radius-${name}: ${value};`)
    }
    for (const [name, value] of Object.entries(tokens.container)) {
      expect(css).toContain(`--container-${name}: ${value};`)
    }
  })

  it("pairs every type step with its line height", () => {
    for (const [name, step] of Object.entries(tokens.text)) {
      expect(css).toContain(`--text-${name}: ${step.size};`)
      expect(css).toContain(`--text-${name}--line-height: ${step.lineHeight};`)
    }
  })

  it("exposes control heights on the spacing scale", () => {
    for (const [name, value] of Object.entries(tokens.controlHeight)) {
      expect(css).toContain(`--spacing-${name}: ${value};`)
    }
  })

  it("emits border width, opacity, z-index and duration utilities bound to variables", () => {
    expect(css).toContain("@utility border-frame {\n  border-width: var(--border-width-frame);\n}")
    expect(css).toContain("@utility border-t-rule {\n  border-top-width: var(--border-width-rule);\n}")
    expect(css).toContain("@utility opacity-disabled {\n  opacity: var(--opacity-disabled);\n}")
    expect(css).toContain("@utility z-menu {\n  z-index: var(--z-index-menu);\n}")
    expect(css).toContain("@utility duration-fast {\n  transition-duration: var(--duration-fast);\n}")
  })
})

describe("renderFavicon", () => {
  it("paints the brand mark in vermilion on paper", () => {
    const svg = renderFavicon()
    expect(svg).toContain(`fill="${tokens.color.vermilion}"`)
    expect(svg).toContain(`fill="${tokens.color.paper}"`)
    expect(svg).toContain("鲁")
  })
})

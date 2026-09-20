import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "../../i18n/I18nProvider.tsx"
import { ResultsBoard } from "./ResultsBoard.tsx"
import { summarize, type CompressionItem } from "./compressorRules.ts"

beforeAll(() => {
  vi.stubGlobal("window", { location: { origin: "https://lubanpng.wizthink.cn", pathname: "/" } })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

const item = (overrides: Partial<CompressionItem>): CompressionItem => ({
  id: "x",
  name: "x.png",
  format: "PNG",
  target: null,
  quotaUnits: 1,
  noGain: false,
  originalSize: 1000,
  stage: "completed",
  uploadRatio: 1,
  queuePosition: null,
  compressedSize: 400,
  compressedUrl: "/v1/images/download/x.png",
  error: null,
  ...overrides,
})

const render = (items: CompressionItem[]): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <I18nProvider>
        <ResultsBoard
          items={items}
          summary={summarize(items)}
          retentionHours={24}
          downloading={false}
          onDownloadAll={() => undefined}
        />
      </I18nProvider>
    </MemoryRouter>,
  )

describe("ResultsBoard", () => {
  it("keeps the size comparison and marks a no-gain completion instead of showing -0%", () => {
    const html = render([item({ originalSize: 1000, compressedSize: 1400, noGain: true })])
    expect(html).toContain("1000 B")
    expect(html).toContain("1400 B")
    expect(html).toContain("未变小 · 未计次")
    expect(html).not.toContain("-0%")
  })

  it("shows a real saving for a counted completion", () => {
    const html = render([item({ originalSize: 2000, compressedSize: 600 })])
    expect(html).toContain("-70%")
    expect(html).not.toContain("未变小")
    expect(html).not.toContain("含转换计")
  })

  it("keeps the failure row as failed without a saving badge", () => {
    const html = render([item({ stage: "failed", compressedSize: null, noGain: true, error: null })])
    expect(html).toContain("失败")
    expect(html).not.toContain("未变小")
    expect(html).not.toContain("-0%")
  })

  it("shows an in-flight row while a task is still running", () => {
    const html = render([item({ stage: "processing", compressedSize: null })])
    expect(html).toContain("处理中")
    expect(html).not.toContain("未变小")
  })

  it("counts charged runs only for counted items and names conversions separately", () => {
    const summary = summarize([
      item({ id: "a", originalSize: 2000, compressedSize: 600, target: "webp", quotaUnits: 2 }),
      item({ id: "b", originalSize: 1000, compressedSize: 1400, noGain: true, target: "avif", quotaUnits: 2 }),
    ])
    expect(summary.quotaUnits).toBe(2)
    expect(summary.conversionRuns).toBe(1)
    const html = render([
      item({ id: "a", originalSize: 2000, compressedSize: 600, target: "webp", quotaUnits: 2 }),
      item({ id: "b", originalSize: 1000, compressedSize: 1400, noGain: true, target: "avif", quotaUnits: 2 }),
    ])
    expect(html).toContain("含转换计 2 次")
    expect(html).toContain("1 张未变小·未计次")
  })

  it("states only the no-gain count when nothing was charged", () => {
    const html = render([item({ originalSize: 1000, compressedSize: 1100, noGain: true })])
    expect(html).toContain("1 张未变小·未计次")
    expect(html).not.toContain("含转换计")
  })
})

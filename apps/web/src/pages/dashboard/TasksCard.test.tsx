import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import type { TaskRecord } from "../../api/client.ts"
import { I18nProvider } from "../../i18n/I18nProvider.tsx"
import { TaskRow } from "./TasksCard.tsx"

const task = (overrides: Partial<TaskRecord>): TaskRecord => ({
  task_id: "t1",
  status: "completed",
  source: "web",
  kind: "compress",
  scale: null,
  original_name: "photo.png",
  original_size: 204800,
  compressed_size: 81920,
  compressed_url: "/v1/images/download/t1.png",
  target_format: null,
  output_format: "png",
  quota_units: 1,
  no_gain: false,
  error_msg: null,
  created_at: 1_760_000_000,
  completed_at: 1_760_000_001,
  expires_at: 1_760_086_400,
  downloadable: true,
  ...overrides,
})

const renderRow = (record: TaskRecord): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <I18nProvider>
        <table>
          <tbody>
            <TaskRow task={record} />
          </tbody>
        </table>
      </I18nProvider>
    </MemoryRouter>,
  )

describe("TaskRow", () => {
  it("shows the upscale factor instead of a fake -0% saving", () => {
    const html = renderRow(
      task({ kind: "upscale", scale: "x2", original_size: 204800, compressed_size: 819200 }),
    )
    expect(html).not.toContain("-0%")
    expect(html).toContain("×2")
    expect(html).toContain("200 KB")
    expect(html).toContain("800 KB")
  })

  it("keeps the saving for a counted compression", () => {
    const html = renderRow(task({ original_size: 2000, compressed_size: 600 }))
    expect(html).toContain("-70%")
    expect(html).not.toContain("×")
  })

  it("falls back to a dash when an upscale has no scale recorded", () => {
    const html = renderRow(
      task({ kind: "upscale", scale: null, original_size: 204800, compressed_size: 819200 }),
    )
    expect(html).not.toContain("-0%")
    expect(html).toContain("—")
  })

  it("keeps a no-gain compression on the not-charged marker", () => {
    const html = renderRow(task({ original_size: 204800, compressed_size: 819200, no_gain: true }))
    expect(html).not.toContain("-0%")
    expect(html).toContain("未变小 · 未计次")
  })
})

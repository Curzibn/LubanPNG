import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { Me } from "../../api/client.ts"
import { I18nProvider } from "../../i18n/I18nProvider.tsx"
import { SessionContext, type SessionValue } from "../../session/sessionContext.ts"
import { HomePage } from "./HomePage.tsx"

beforeAll(() => {
  vi.stubGlobal("window", { location: { origin: "https://lubanpng.wizthink.cn", pathname: "/" } })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

type MeOverrides = {
  subject?: Me["subject"]
  remaining?: number
  planId?: Me["plan"]["id"]
}

const meFor = ({ subject = "device", remaining = 5, planId = "anonymous" }: MeOverrides): Me => ({
  subject,
  email: subject === "account" ? "zibin@example.com" : null,
  plan: {
    id: planId,
    name: planId,
    period: subject === "account" ? "month" : "day",
    quota: planId === "anonymous" ? 5 : 50,
    max_file_size: 5242880,
    retention_hours: 24,
    max_api_keys: 1,
  },
  quota: {
    period_key: "2026-09-20",
    limit: planId === "anonymous" ? 5 : 50,
    used: planId === "anonymous" ? 5 - remaining : 50 - remaining,
    held: 0,
    remaining,
    resets_at: "2026-10-01T00:00:00+08:00",
  },
})

const sessionFor = (me: Me): SessionValue => ({
  status: "ready",
  me,
  signedIn: me.subject === "account",
  refresh: async () => undefined,
  applyQuota: () => undefined,
  signOut: async () => undefined,
})

const renderHome = (path: string, me: Me): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <SessionContext value={sessionFor(me)}>
          <HomePage />
        </SessionContext>
      </I18nProvider>
    </MemoryRouter>,
  )

describe("home quota guidance", () => {
  it("warns in place once two runs are left, without promising an unshipped plan", () => {
    const html = renderHome("/", meFor({ remaining: 2 }))
    expect(html).toContain("今日还剩 2 次")
    expect(html).toContain("登录后继续用")
    expect(html).not.toContain("Pro")
  })

  it("stays quiet while the visitor still has headroom", () => {
    expect(renderHome("/", meFor({ remaining: 5 }))).not.toContain("今日还剩")
  })

  it("points a signed-out visitor at registration once the daily quota is gone", () => {
    const html = renderHome("/", meFor({ remaining: 0 }))
    expect(html).toContain("今日免费次数已用完")
    expect(html).toContain("每月 50 次")
    expect(html).toContain("登录后继续用")
    expect(html).not.toContain("加入等待名单")
  })

  it("lets a signed-in visitor join the waitlist in one click once the month is gone", () => {
    const html = renderHome("/", meFor({ subject: "account", planId: "free", remaining: 0 }))
    expect(html).toContain("本月额度已用完")
    expect(html).toContain("加入等待名单")
  })

  it("renders the same guidance in English", () => {
    const html = renderHome("/en/", meFor({ remaining: 1 }))
    expect(html).toContain("1 run left today")
    expect(html).toContain("Sign in to keep going")
  })

  it("warns a signed-in account as the month runs low without a waitlist pitch", () => {
    const html = renderHome("/", meFor({ subject: "account", planId: "free", remaining: 2 }))
    expect(html).toContain("本月还剩 2 次")
    expect(html).not.toContain("加入等待名单")
  })

  it("renders the account warning in English with its singular form", () => {
    const html = renderHome("/en/", meFor({ subject: "account", planId: "free", remaining: 1 }))
    expect(html).toContain("1 run left this month")
    expect(html).not.toContain("Join the waitlist")
  })
})

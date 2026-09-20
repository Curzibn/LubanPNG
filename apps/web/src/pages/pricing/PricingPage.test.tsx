import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import type { Me } from "../../api/client.ts"
import { I18nProvider } from "../../i18n/I18nProvider.tsx"
import { SessionContext, type SessionValue } from "../../session/sessionContext.ts"
import { PricingPage } from "./PricingPage.tsx"

const accountMe: Me = {
  subject: "account",
  email: "zibin@example.com",
  plan: {
    id: "free",
    name: "free",
    period: "month",
    quota: 50,
    max_file_size: 5242880,
    retention_hours: 24,
    max_api_keys: 3,
  },
  quota: {
    period_key: "2026-09",
    limit: 50,
    used: 50,
    held: 0,
    remaining: 0,
    resets_at: "2026-10-01T00:00:00+08:00",
  },
}

const sessionFor = (me: Me | null): SessionValue => ({
  status: "ready",
  me,
  signedIn: me !== null,
  refresh: async () => undefined,
  applyQuota: () => undefined,
  signOut: async () => undefined,
})

const renderPricing = (path: string, me: Me | null): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <SessionContext value={sessionFor(me)}>
          <PricingPage />
        </SessionContext>
      </I18nProvider>
    </MemoryRouter>,
  )

describe("pricing waitlist", () => {
  it("explains the sign-in gate instead of offering an inert button", () => {
    const html = renderPricing("/pricing", null)
    expect(html).toContain("登录后可加入等待名单")
    expect(html).toContain("等待名单对登录用户开放")
    expect(html).toContain('href="/login"')
  })

  it("offers one-click joining to a signed-in visitor", () => {
    const html = renderPricing("/pricing", accountMe)
    expect(html).toContain("加入等待名单")
    expect(html).not.toContain("登录后可加入等待名单")
  })

  it("points the English sign-in hint at the localized login route", () => {
    const html = renderPricing("/en/pricing", null)
    expect(html).toContain("Sign in to join the waitlist")
    expect(html).toContain('href="/en/login"')
  })
})

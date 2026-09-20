import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { I18nProvider } from "../i18n/I18nProvider.tsx"
import { SessionContext, type SessionValue } from "../session/sessionContext.ts"
import { WaitlistButton } from "./WaitlistButton.tsx"

const sessionFor = (signedIn: boolean): SessionValue => ({
  status: "ready",
  me: null,
  signedIn,
  refresh: async () => undefined,
  applyQuota: () => undefined,
  signOut: async () => undefined,
})

const renderButton = (path: string, signedIn: boolean): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <SessionContext value={sessionFor(signedIn)}>
          <WaitlistButton planId="pro" />
        </SessionContext>
      </I18nProvider>
    </MemoryRouter>,
  )

describe("WaitlistButton", () => {
  it("keeps the signed-out button inert and links to the localized sign-in", () => {
    const html = renderButton("/pricing", false)
    expect(html).toContain("登录后可加入等待名单")
    expect(html).toContain("等待名单对登录用户开放")
    expect(html).toContain('disabled=""')
    expect(html).toContain('href="/login"')
  })

  it("points English visitors at the English sign-in route", () => {
    const html = renderButton("/en/pricing", false)
    expect(html).toContain("Sign in to join the waitlist")
    expect(html).toContain('disabled=""')
    expect(html).toContain('href="/en/login"')
  })

  it("offers the one-click join once signed in", () => {
    const html = renderButton("/pricing", true)
    expect(html).toContain("加入等待名单")
    expect(html).not.toContain("登录后可加入等待名单")
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('href="/login"')
  })
})

import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { I18nProvider } from "../../i18n/I18nProvider.tsx"
import { PricingPage } from "./PricingPage.tsx"

const renderPricing = (path: string): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <PricingPage />
      </I18nProvider>
    </MemoryRouter>,
  )

describe("pricing page", () => {
  it("states the free capabilities without any paid preview", () => {
    const html = renderPricing("/pricing")
    expect(html).toContain("所有已上线能力当前免费开放")
    expect(html).toContain("未登录：每天 5 次")
    expect(html).toContain("注册后：每月 50 次")
    expect(html).not.toContain("等待名单")
    expect(html).not.toContain("Pro")
  })

  it("offers direct entry points to the web app, the CLI and the docs", () => {
    const html = renderPricing("/pricing")
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/developers#cli"')
    expect(html).toContain('href="/developers"')
  })

  it("renders the English variant without the waitlist or paid previews", () => {
    const html = renderPricing("/en/pricing")
    expect(html).toContain("Every shipped capability is free to use right now.")
    expect(html).not.toContain("waitlist")
    expect(html).not.toContain("Pro")
    expect(html).toContain('href="/en/developers#cli"')
  })

  it("states the upscale billing rule on both language variants", () => {
    const zh = renderPricing("/pricing")
    expect(zh).toContain("放大怎么计次？")
    expect(zh).toContain("「更小才计次」的规则不适用于放大")
    const en = renderPricing("/en/pricing")
    expect(en).toContain("How are upscales counted?")
    expect(en).toContain("the \u201csmaller output\u201d rule does not apply to it")
  })
})

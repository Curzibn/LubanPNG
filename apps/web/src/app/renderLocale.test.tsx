import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "../i18n/I18nProvider.tsx"
import { AppRoutes } from "./App.tsx"

const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g

const render = (path: string): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <AppRoutes />
      </I18nProvider>
    </MemoryRouter>,
  )

const cjkOutsideAutonyms = (html: string): string[] => html.replaceAll("中文", "").match(cjk) ?? []

beforeAll(() => {
  vi.stubGlobal("window", { location: { origin: "https://lubanpng.wizthink.cn", pathname: "/" } })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

const chineseRoutes: ReadonlyArray<readonly [string, string]> = [
  ["/", "把图片刨薄，不伤画质。"],
  ["/pricing", "一个额度池，三个入口"],
  ["/developers", "开发者"],
  ["/login", "登录或注册"],
  ["/dashboard", "正在读取账号…"],
  ["/terms", "服务条款"],
  ["/privacy", "隐私政策"],
  ["/does-not-exist", "这一页不在刨床上"],
]

const englishRoutes: ReadonlyArray<readonly [string, string]> = [
  ["/en/", "Shave image weight. Keep it sharp."],
  ["/en/pricing", "One quota pool, three doors"],
  ["/en/developers", "Developers"],
  ["/en/login", "Sign in or sign up"],
  ["/en/dashboard", "Loading your account…"],
  ["/en/terms", "Terms of Service"],
  ["/en/privacy", "Privacy Policy"],
  ["/en/does-not-exist", "This page never made it to the bench"],
]

describe("localized rendering", () => {
  it.each(chineseRoutes)("renders %s in Chinese", (path, expected) => {
    expect(render(path)).toContain(expected)
  })

  it.each(englishRoutes)("renders %s in English", (path, expected) => {
    expect(render(path)).toContain(expected)
  })

  it.each(englishRoutes)("leaves no Chinese copy on %s", (path) => {
    expect(cjkOutsideAutonyms(render(path))).toEqual([])
  })

  it.each(chineseRoutes)("leaves no English marketing copy on %s", (path) => {
    expect(render(path)).not.toContain("Shave image weight. Keep it sharp.")
  })
})

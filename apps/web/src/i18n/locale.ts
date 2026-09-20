export type Locale = "zh-CN" | "en"

export const LOCALES: readonly Locale[] = ["zh-CN", "en"]

export const DEFAULT_LOCALE: Locale = "zh-CN"

export const LOCALE_STORAGE_KEY = "lubanpng:locale"

export const isLocale = (value: string): value is Locale => value === "zh-CN" || value === "en"

export const parseStoredLocale = (raw: string | null): Locale | null =>
  raw !== null && isLocale(raw) ? raw : null

export const isEnglishPath = (pathname: string): boolean => pathname === "/en" || pathname.startsWith("/en/")

export const localeFromPath = (pathname: string): Locale => (isEnglishPath(pathname) ? "en" : DEFAULT_LOCALE)

const collapseSlashes = (path: string): string => path.replace(/\/{2,}/g, "/")

export const stripLocalePrefix = (pathname: string): string => {
  if (pathname === "/en") return "/"
  if (pathname.startsWith("/en/")) return collapseSlashes(pathname.slice(3))
  return collapseSlashes(pathname)
}

export const localizedPath = (pathname: string, locale: Locale): string => {
  const bare = stripLocalePrefix(pathname)
  if (locale === "en") return bare === "/" ? "/en/" : `/en${bare}`
  return bare
}

export const switchLocaleHref = (pathname: string, search: string, hash: string, target: Locale): string => {
  const params = new URLSearchParams(search)
  const next = params.get("next")
  if (next !== null) params.set("next", localizedPath(next, target))
  const query = params.toString()
  return `${localizedPath(pathname, target)}${query === "" ? "" : `?${query}`}${hash}`
}

export const detectBrowserLocale = (languages: readonly string[]): Locale =>
  languages.some((tag) => tag.trim().toLowerCase().startsWith("zh")) ? "zh-CN" : "en"

export type LocaleRedirectInput = {
  pathname: string
  search: string
  hash: string
  stored: Locale | null
  languages: readonly string[]
}

export const initialRedirectTarget = (input: LocaleRedirectInput): string | null => {
  if (input.stored !== null) return null
  if (isEnglishPath(input.pathname)) return null
  if (detectBrowserLocale(input.languages) !== "en") return null
  return switchLocaleHref(input.pathname, input.search, input.hash, "en")
}

export const readStoredLocale = (): Locale | null => {
  try {
    return parseStoredLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return null
  }
}

export const writeStoredLocale = (locale: Locale): void => {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    return
  }
}

export const browserLanguages = (): readonly string[] => {
  if (typeof navigator === "undefined") return []
  const languages = navigator.languages
  if (languages !== undefined && languages.length > 0) return languages
  return navigator.language === "" ? [] : [navigator.language]
}

export const applyInitialRedirect = (): void => {
  if (typeof window === "undefined") return
  const target = initialRedirectTarget({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    stored: readStoredLocale(),
    languages: browserLanguages(),
  })
  if (target === null) return
  window.history.replaceState(window.history.state, "", target)
}

export const requestLocale = (): Locale =>
  typeof window === "undefined" ? DEFAULT_LOCALE : localeFromPath(window.location.pathname)

export const acceptLanguage = (): string => requestLocale()

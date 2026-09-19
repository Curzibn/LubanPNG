import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import { useLocation } from "react-router"
import { localeFromPath, type Locale } from "./locale.ts"
import { messages, translate, type MessageKey, type MessageParams } from "./messages.ts"

export type I18nValue = {
  locale: Locale
  t: (key: MessageKey, params?: MessageParams) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation()
  const locale = localeFromPath(pathname)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18nValue>(
    () => ({ locale, t: (key, params) => translate(messages[locale], key, params) }),
    [locale],
  )

  return <I18nContext value={value}>{children}</I18nContext>
}

export const useI18n = (): I18nValue => {
  const value = useContext(I18nContext)
  if (value === null) throw new Error("useI18n must be used within I18nProvider")
  return value
}

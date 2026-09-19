import { useLocation, useNavigate } from "react-router"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { LOCALES, switchLocaleHref, writeStoredLocale, type Locale } from "../i18n/locale.ts"
import { cx } from "../lib/cx.ts"

const labelKeys = { "zh-CN": "lang.zh", en: "lang.en" } as const

export const LanguageSwitcher = () => {
  const { locale, t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className="flex items-center gap-0.5 rounded-pill border-thin border-hairline p-0.5"
    >
      {LOCALES.map((item: Locale) => (
        <button
          key={item}
          type="button"
          aria-pressed={item === locale}
          onClick={() => {
            if (item === locale) return
            writeStoredLocale(item)
            navigate(switchLocaleHref(location.pathname, location.search, location.hash, item))
          }}
          className={cx(
            "inline-flex h-control-xs items-center rounded-pill px-2.5 text-label-sm font-semibold transition-colors",
            item === locale ? "bg-ink text-paper" : "text-ink-secondary hover:text-ink",
          )}
        >
          {t(labelKeys[item])}
        </button>
      ))}
    </div>
  )
}

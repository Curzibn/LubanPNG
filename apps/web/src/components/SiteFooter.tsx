import { Link } from "react-router"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { localizedPath } from "../i18n/locale.ts"
import { BrandMark, Wordmark } from "./BrandMark.tsx"

export const GITHUB_URL = "https://github.com/Curzibn/LubanPNG"

const footerLinks = [
  { labelKey: "footer.pricing", shortKey: "footer.pricing.short", to: "/pricing" },
  { labelKey: "footer.developers", shortKey: "footer.developers.short", to: "/developers" },
  { labelKey: "footer.cli", shortKey: "footer.cli.short", to: "/developers#cli" },
  { labelKey: "footer.terms", shortKey: "footer.terms.short", to: "/terms" },
  { labelKey: "footer.privacy", shortKey: "footer.privacy.short", to: "/privacy" },
] as const

export const SiteFooter = () => {
  const { locale, t } = useI18n()
  return (
    <footer className="mt-12 border-t-thin border-hairline md:mt-24">
      <div className="px-5 md:px-10">
        <div className="mx-auto flex w-full max-w-page flex-col-reverse gap-2.5 pb-8 pt-6 text-label text-ink-secondary md:flex-row md:items-center md:justify-between md:py-8 md:text-ui">
          <div className="flex items-center gap-2.5">
            <BrandMark size="footer" className="hidden md:inline-flex" />
            <Wordmark className="hidden md:inline" />
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-vermilion">
              {t("footer.source")}
            </a>
          </div>
          <nav aria-label={t("footer.nav.aria")} className="-ml-2 flex flex-wrap gap-1 md:ml-0 md:gap-7">
            {footerLinks.map((link) => (
              <Link
                key={link.to}
                to={localizedPath(link.to, locale)}
                className="inline-flex min-h-control items-center px-2 transition-colors hover:text-vermilion md:min-h-0 md:px-0"
              >
                <span className="md:hidden">{t(link.shortKey)}</span>
                <span className="hidden md:inline">{t(link.labelKey)}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}

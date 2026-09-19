import { Link } from "react-router"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { localizedPath } from "../i18n/locale.ts"
import { cx } from "../lib/cx.ts"

type MarkSize = "header" | "footer"

const markClass: Record<MarkSize, string> = {
  header: "size-6.5 rounded-mark text-ui-lg md:size-7.5 md:text-brand-mark",
  footer: "size-5.5 rounded-mark-sm text-ui",
}

export const BrandMark = ({ size = "header", className }: { size?: MarkSize; className?: string }) => {
  const { t } = useI18n()
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center bg-vermilion font-display leading-none text-paper",
        markClass[size],
        className,
      )}
    >
      {t("brand.mark")}
    </span>
  )
}

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cx("font-mono font-semibold tracking-tight text-ink", className)}>LubanPNG</span>
)

export const BrandLink = () => {
  const { locale, t } = useI18n()
  return (
    <Link to={localizedPath("/", locale)} className="flex items-center gap-2.5 md:gap-3" aria-label={t("brand.homeAria")}>
      <BrandMark />
      <Wordmark className="text-body-lg leading-none md:text-heading-sm" />
    </Link>
  )
}

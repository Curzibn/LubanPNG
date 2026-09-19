import { Link } from "react-router"
import { QuotaRing } from "../../components/QuotaRing.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { localizedPath } from "../../i18n/locale.ts"
import { useSession } from "../../session/sessionContext.ts"

const MONTHLY_QUOTA_AFTER_LOGIN = 50

export const QuotaChip = () => {
  const { locale, t } = useI18n()
  const { me, status } = useSession()
  if (status === "loading") {
    return <p className="mt-1.5 text-label text-ink-secondary md:mt-2 md:text-ui">{t("quota.loading")}</p>
  }
  if (!me) {
    return <p className="mt-1.5 text-label text-ink-secondary md:mt-2 md:text-ui">{t("quota.unavailable")}</p>
  }
  const { limit, remaining } = me.quota
  const anonymous = me.subject !== "account"
  const ringLabel = anonymous
    ? t("quota.ring.today", { limit, remaining })
    : t("quota.ring.month", { limit, remaining })
  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-label text-ink-secondary md:mt-2 md:gap-3.5 md:text-ui md:text-ink">
      <span className="flex items-center gap-2 md:gap-2.5 md:rounded-pill md:border-thin md:border-hairline md:bg-paper md:px-3.5 md:py-2">
        <QuotaRing remaining={remaining} limit={limit} label={ringLabel} />
        {anonymous ? (
          <span>
            {t("quota.anon.lead", { limit })}{" "}
            <strong className="font-medium md:font-bold">{t("quota.anon.strong", { remaining })}</strong>
          </span>
        ) : (
          <span>
            {t("quota.month.lead")}{" "}
            <strong className="font-medium md:font-bold">{t("quota.month.strong", { remaining })}</strong>
          </span>
        )}
      </span>
      {anonymous && (
        <Link
          to={localizedPath("/login", locale)}
          className="inline-flex min-h-control items-center px-1 text-vermilion hover:text-vermilion-hover md:min-h-0 md:px-0"
        >
          {t("quota.signIn", { count: MONTHLY_QUOTA_AFTER_LOGIN })}
        </Link>
      )}
    </div>
  )
}

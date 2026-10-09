import type { Me } from "../../api/client.ts"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { QuotaRing } from "../../components/QuotaRing.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { formatResetTime } from "../../lib/format.ts"

export const QuotaCard = ({ me }: { me: Me }) => {
  const { locale, t } = useI18n()
  const { quota, plan } = me
  const periodLabel = plan.period === "day" ? t("dash.quota.today") : t("dash.quota.month")
  const reset = formatResetTime(quota.resets_at, locale)
  return (
    <section aria-label={periodLabel} className="flex flex-col gap-5 rounded-card border-thin border-hairline bg-surface p-5 md:p-7">
      <Eyebrow>{periodLabel}</Eyebrow>
      <div className="flex items-center gap-5 md:gap-6">
        <QuotaRing
          variant="card"
          remaining={quota.remaining}
          limit={quota.limit}
          label={t("dash.quota.ring", { remaining: quota.remaining, limit: quota.limit })}
          caption={t("dash.quota.caption", { limit: quota.limit })}
        />
        <div className="flex flex-col gap-2 text-ui leading-relaxed">
          <p>{t("dash.quota.used", { used: quota.used, remaining: quota.remaining })}</p>
          {reset && <p className="text-ink-secondary">{t("dash.quota.reset", { time: reset })}</p>}
        </div>
      </div>
    </section>
  )
}

import { useEffect } from "react"
import { useNavigate } from "react-router"
import { usePageMeta } from "../../app/usePageMeta.ts"
import { Container } from "../../components/Container.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { localizedPath } from "../../i18n/locale.ts"
import { useSession } from "../../session/sessionContext.ts"
import { ApiKeysCard } from "./ApiKeysCard.tsx"
import { planLabelKeys } from "./planLabels.ts"
import { QuotaCard } from "./QuotaCard.tsx"
import { TasksCard } from "./TasksCard.tsx"

export const DashboardPage = () => {
  const { locale, t } = useI18n()
  usePageMeta("dashboard")
  const { me, status, signedIn } = useSession()
  const navigate = useNavigate()
  const loginHref = `${localizedPath("/login", locale)}?next=${encodeURIComponent(localizedPath("/dashboard", locale))}`

  useEffect(() => {
    if (status !== "loading" && !signedIn) navigate(loginHref, { replace: true })
  }, [status, signedIn, navigate, loginHref])

  if (!signedIn || !me) {
    return (
      <Container className="pt-12">
        <p className="text-ui text-ink-secondary">{status === "loading" ? t("dash.loading") : t("dash.redirecting")}</p>
      </Container>
    )
  }

  const periodKey = me.plan.period === "day" ? "dash.period.day" : "dash.period.month"

  return (
    <Container className="pt-8 md:pt-12">
      <div className="flex flex-col gap-5 md:gap-7">
        <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
          <h1 className="font-display text-display-sm text-ink md:text-display-md">{t("dash.title")}</h1>
          <p className="text-ui text-ink-secondary">
            {t("dash.planSummary", {
              name: t(planLabelKeys[me.plan.id]),
              period: t(periodKey),
              count: me.plan.quota,
            })}
          </p>
        </div>
        <div className="flex flex-col gap-5 lg:grid lg:grid-dashboard lg:items-stretch lg:gap-6">
          <QuotaCard me={me} />
          <ApiKeysCard plan={me.plan} />
        </div>
        <TasksCard retentionHours={me.plan.retention_hours} />
      </div>
    </Container>
  )
}

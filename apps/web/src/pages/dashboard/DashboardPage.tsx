import { useEffect } from "react"
import { useNavigate } from "react-router"
import { usePageTitle } from "../../app/usePageTitle.ts"
import { Container } from "../../components/Container.tsx"
import { useSession } from "../../session/sessionContext.ts"
import { ApiKeysCard } from "./ApiKeysCard.tsx"
import { QuotaCard } from "./QuotaCard.tsx"
import { TasksCard } from "./TasksCard.tsx"

const LOGIN_REDIRECT = "/login?next=/dashboard"

export const DashboardPage = () => {
  usePageTitle("工作台")
  const { me, status, signedIn } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (status !== "loading" && !signedIn) navigate(LOGIN_REDIRECT, { replace: true })
  }, [status, signedIn, navigate])

  if (!signedIn || !me) {
    return (
      <Container className="pt-12">
        <p className="text-ui text-ink-secondary">{status === "loading" ? "正在读取账号…" : "正在跳转到登录…"}</p>
      </Container>
    )
  }

  const periodLabel = me.plan.period === "day" ? "每天" : "每月"

  return (
    <Container className="pt-8 md:pt-12">
      <div className="flex flex-col gap-5 md:gap-7">
        <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
          <h1 className="font-display text-display-sm text-ink md:text-display-md">工作台</h1>
          <p className="text-ui text-ink-secondary">
            {me.plan.name} · {periodLabel} {me.plan.quota} 次
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

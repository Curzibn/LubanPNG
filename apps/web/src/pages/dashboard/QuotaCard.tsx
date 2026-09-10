import type { Me } from "../../api/client.ts"
import { LinkButton } from "../../components/Button.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { QuotaRing } from "../../components/QuotaRing.tsx"
import { formatResetTime } from "../../lib/format.ts"

export const QuotaCard = ({ me }: { me: Me }) => {
  const { quota, plan } = me
  const periodLabel = plan.period === "day" ? "今日额度" : "本月额度"
  const reset = formatResetTime(quota.resets_at)
  return (
    <section aria-label={periodLabel} className="flex flex-col gap-5 rounded-card border-thin border-hairline bg-surface p-5 md:p-7">
      <Eyebrow>{periodLabel}</Eyebrow>
      <div className="flex items-center gap-5 md:gap-6">
        <QuotaRing
          variant="card"
          remaining={quota.remaining}
          limit={quota.limit}
          label={`剩余 ${quota.remaining} 次，共 ${quota.limit} 次`}
        />
        <div className="flex flex-col gap-2 text-ui leading-relaxed">
          <p>
            已用 <span className="font-mono font-semibold">{quota.used}</span> 次，剩余{" "}
            <span className="font-mono font-semibold">{quota.remaining}</span> 次
          </p>
          {reset && <p className="text-ink-secondary">{reset} 重置</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 border-t-thin border-hairline pt-4">
        <p className="text-ui text-ink-secondary">需要更多次数？Pro 与按量计费即将推出。</p>
        <LinkButton to="/pricing" variant="outline" size="md" className="w-full">
          加入 Pro 等待名单
        </LinkButton>
      </div>
    </section>
  )
}

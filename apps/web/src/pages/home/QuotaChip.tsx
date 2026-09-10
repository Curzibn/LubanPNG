import { Link } from "react-router"
import { QuotaRing } from "../../components/QuotaRing.tsx"
import { useSession } from "../../session/sessionContext.ts"

const MONTHLY_QUOTA_AFTER_LOGIN = 50

export const QuotaChip = () => {
  const { me, status } = useSession()
  if (status === "loading") {
    return <p className="mt-1.5 text-label text-ink-secondary md:mt-2 md:text-ui">正在读取额度…</p>
  }
  if (!me) {
    return <p className="mt-1.5 text-label text-ink-secondary md:mt-2 md:text-ui">额度暂时无法读取，可直接尝试上传。</p>
  }
  const { limit, remaining } = me.quota
  const anonymous = me.subject !== "account"
  const ringLabel = anonymous ? `今日额度 ${limit} 次，剩余 ${remaining} 次` : `本月额度 ${limit} 次，剩余 ${remaining} 次`
  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-label text-ink-secondary md:mt-2 md:gap-3.5 md:text-ui md:text-ink">
      <span className="flex items-center gap-2 md:gap-2.5 md:rounded-pill md:border-thin md:border-hairline md:bg-paper md:px-3.5 md:py-2">
        <QuotaRing remaining={remaining} limit={limit} label={ringLabel} />
        {anonymous ? (
          <span>
            今日免费 {limit} 次 · <strong className="font-medium md:font-bold">剩余 {remaining} 次</strong>
          </span>
        ) : (
          <span>
            本月剩余 <strong className="font-medium md:font-bold">{remaining} 次</strong>
          </span>
        )}
      </span>
      {anonymous && (
        <Link to="/login" className="inline-flex min-h-control items-center px-1 text-vermilion hover:text-vermilion-hover md:min-h-0 md:px-0">
          登录后每月 {MONTHLY_QUOTA_AFTER_LOGIN} 次
        </Link>
      )}
    </div>
  )
}

import { useState } from "react"
import { errorMessage, joinWaitlist, type WaitlistPlanId } from "../../api/client.ts"
import { usePageTitle } from "../../app/usePageTitle.ts"
import { Button, LinkButton } from "../../components/Button.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { CheckIcon } from "../../components/icons.tsx"
import { Notice } from "../../components/Notice.tsx"
import { cx } from "../../lib/cx.ts"
import { useSession } from "../../session/sessionContext.ts"

type FreePlanCard = {
  id: "free"
  waitlist: false
  eyebrow: string
  price: string
  description: string
  features: string[]
}

type WaitlistPlanCard = {
  id: WaitlistPlanId
  waitlist: true
  dark: boolean
  eyebrow: string
  price: string
  description: string
  features: string[]
}

type PlanCard = FreePlanCard | WaitlistPlanCard

const plans: PlanCard[] = [
  {
    id: "free",
    waitlist: false,
    eyebrow: "免费",
    price: "¥0",
    description: "试一试，或者小量长期使用。",
    features: ["未登录：每天 5 次", "注册后：每月 50 次", "单张 5 MB 以内", "API Key 1 个", "产物保留 24 小时"],
  },
  {
    id: "pro",
    waitlist: true,
    dark: true,
    eyebrow: "Pro",
    price: "规划中",
    description: "给每天都在出图的人。",
    features: ["更高的每月额度", "更大的单张文件上限", "更长的产物保留"],
  },
  {
    id: "metered",
    waitlist: true,
    dark: false,
    eyebrow: "按量",
    price: "规划中",
    description: "给接进流水线的 API 用户。",
    features: ["额度用完后按量延续", "按实际用量计费"],
  },
]

const faqs = [
  { question: "压缩失败会扣次数吗？", answer: "不会。只有成功产出压缩文件才计一次。" },
  { question: "次数什么时候重置？", answer: "未登录按天，注册用户按自然月，重置时间在工作台里可见。" },
  { question: "网页和 API 分开算吗？", answer: "不分。一个账号一份次数，网页、API、CLI 共用。" },
]

const WaitlistAction = ({ planId, dark }: { planId: WaitlistPlanId; dark: boolean }) => {
  const { signedIn } = useSession()
  const [joined, setJoined] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    setSubmitting(true)
    try {
      await joinWaitlist(planId)
      setJoined(true)
      setError(null)
    } catch (joinError) {
      setError(errorMessage(joinError, "加入等待名单失败，请稍后再试"))
    } finally {
      setSubmitting(false)
    }
  }

  if (!signedIn) {
    return (
      <div className="mt-auto flex w-full flex-col gap-2">
        <Button variant={dark ? "outlineNight" : "outline"} size="lg" className="w-full" disabled>
          规划中 · 暂未开放
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-auto flex w-full flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        variant={joined ? (dark ? "outlineNight" : "outline") : "accent"}
        size="lg"
        className="w-full"
        disabled={submitting || joined}
        onClick={() => void handleJoin()}
      >
        {joined ? "已在等待名单中" : submitting ? "提交中…" : "加入等待名单"}
      </Button>
    </div>
  )
}

const PlanCardView = ({ plan }: { plan: PlanCard }) => {
  const dark = plan.waitlist ? plan.dark : false
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={cx(
        "relative flex flex-col gap-5.5 rounded-card p-6 md:p-8",
        dark ? "bg-night text-night-text" : "border-thin border-hairline bg-surface text-ink",
      )}
    >
      {plan.waitlist && (
        <span
          className={cx(
            "absolute right-5 top-5 rounded-pill border-thin px-2.5 py-1 font-mono text-label-xs tracking-badge",
            dark ? "border-night-muted text-night-muted" : "border-hairline text-ink-secondary",
          )}
        >
          规划中
        </span>
      )}
      <div className="flex flex-col gap-2">
        <Eyebrow tone={dark ? "night" : "paper"}>{plan.eyebrow}</Eyebrow>
        <p className="flex items-baseline gap-2">
          <span id={`plan-${plan.id}`} className="font-display text-display-lg leading-none">
            {plan.price}
          </span>
        </p>
        <p className={cx("text-ui", dark ? "text-night-muted" : "text-ink-secondary")}>{plan.description}</p>
      </div>
      <ul className="flex flex-col gap-3 text-body leading-normal">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <CheckIcon label="包含" className={cx("mt-0.5 size-4.5 shrink-0", dark ? "text-jade-bright" : "text-jade")} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {plan.waitlist ? (
        <WaitlistAction planId={plan.id} dark={dark} />
      ) : (
        <LinkButton to="/" variant="outline" size="lg" className="mt-auto w-full">
          免费开始
        </LinkButton>
      )}
    </article>
  )
}

export const PricingPage = () => {
  usePageTitle("定价")
  return (
    <Container>
      <section className="flex flex-col gap-4 pb-8 pt-10 md:items-center md:pb-12 md:pt-18 md:text-center">
        <h1 className="font-display text-display-sm text-ink md:text-display-xl">一个额度池，三个入口</h1>
        <p className="max-w-lede-sm text-body text-pretty text-ink-secondary md:text-lede">
          网页、API、CLI 用的是同一份次数。一次成功压缩计一次，失败不计。
        </p>
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch md:gap-6">
        {plans.map((plan) => (
          <PlanCardView key={plan.id} plan={plan} />
        ))}
      </div>
      <section aria-label="常见问题" className="grid grid-cols-1 gap-6 pt-12 md:grid-cols-3 md:pt-18">
        {faqs.map((faq) => (
          <div key={faq.question} className="flex flex-col gap-2 border-t-thin border-hairline pt-4.5">
            <h2 className="text-ui-lg font-medium text-ink">{faq.question}</h2>
            <p className="text-ui leading-prose text-ink-secondary">{faq.answer}</p>
          </div>
        ))}
      </section>
    </Container>
  )
}

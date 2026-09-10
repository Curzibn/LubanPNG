import { usePageTitle } from "../../app/usePageTitle.ts"
import { LinkButton } from "../../components/Button.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { CheckIcon } from "../../components/icons.tsx"
import { cx } from "../../lib/cx.ts"

type PlanCard = {
  id: string
  eyebrow: string
  price: string
  priceSuffix?: string
  description: string
  features: string[]
  action: { label: string; to: string; accent: boolean }
  dark: boolean
  comingSoon: boolean
}

const plans: PlanCard[] = [
  {
    id: "free",
    eyebrow: "免费",
    price: "¥0",
    description: "试一试，或者小量长期使用。",
    features: ["未登录：每天 5 次", "注册后：每月 50 次", "单张 5 MB 以内", "API Key 1 个，CLI 可用", "产物保留 24 小时"],
    action: { label: "免费开始", to: "/", accent: false },
    dark: false,
    comingSoon: false,
  },
  {
    id: "pro",
    eyebrow: "Pro",
    price: "[价格待定]",
    priceSuffix: "/ 月",
    description: "给每天都在出图的人。",
    features: ["每月 [次数待定] 次", "单张 25 MB 以内", "优先队列", "API Key 5 个", "产物保留 7 天"],
    action: { label: "登录即可加入等待名单", to: "/login", accent: true },
    dark: true,
    comingSoon: true,
  },
  {
    id: "metered",
    eyebrow: "按量",
    price: "[单价待定]",
    priceSuffix: "/ 次",
    description: "给接进流水线的 API 与 CLI 用户。",
    features: ["免费额度用完后按次计费", "预充值，用多少扣多少", "单张 25 MB 以内", "用量随每个响应返回"],
    action: { label: "查看 API 文档", to: "/developers", accent: false },
    dark: false,
    comingSoon: true,
  },
]

const faqs = [
  { question: "压缩失败会扣次数吗？", answer: "不会。只有成功产出压缩文件才计一次。" },
  { question: "次数什么时候重置？", answer: "未登录按天，注册用户按自然月，重置时间在工作台里可见。" },
  { question: "网页和 API 分开算吗？", answer: "不分。一个账号一份次数，网页、API、CLI 共用。" },
]

const PlanCardView = ({ plan }: { plan: PlanCard }) => (
  <article
    aria-labelledby={`plan-${plan.id}`}
    className={cx(
      "relative flex flex-col gap-5.5 rounded-card p-6 md:p-8",
      plan.dark ? "bg-night text-night-text" : "border-thin border-hairline bg-surface text-ink",
    )}
  >
    {plan.comingSoon && (
      <span
        className={cx(
          "absolute right-5 top-5 rounded-pill border-thin px-2.5 py-1 font-mono text-label-xs tracking-badge",
          plan.dark ? "border-night-muted text-night-muted" : "border-hairline text-ink-secondary",
        )}
      >
        即将推出
      </span>
    )}
    <div className="flex flex-col gap-2">
      <Eyebrow tone={plan.dark ? "night" : "paper"}>{plan.eyebrow}</Eyebrow>
      <p className="flex items-baseline gap-2">
        <span id={`plan-${plan.id}`} className="font-display text-display-lg leading-none">
          {plan.price}
        </span>
        {plan.priceSuffix && (
          <span className={cx("text-ui", plan.dark ? "text-night-muted" : "text-ink-secondary")}>{plan.priceSuffix}</span>
        )}
      </p>
      <p className={cx("text-ui", plan.dark ? "text-night-muted" : "text-ink-secondary")}>{plan.description}</p>
    </div>
    <ul className="flex flex-col gap-3 text-body leading-normal">
      {plan.features.map((feature) => (
        <li key={feature} className="flex gap-2.5">
          <CheckIcon label="包含" className={cx("mt-0.5 size-4.5 shrink-0", plan.dark ? "text-jade-bright" : "text-jade")} />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
    <LinkButton
      to={plan.action.to}
      variant={plan.action.accent ? "accent" : "outline"}
      size="lg"
      className="mt-auto w-full"
    >
      {plan.action.label}
    </LinkButton>
  </article>
)

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

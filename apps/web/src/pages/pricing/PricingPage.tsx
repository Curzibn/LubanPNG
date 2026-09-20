import { type WaitlistPlanId } from "../../api/client.ts"
import { usePageMeta } from "../../app/usePageMeta.ts"
import { LinkButton } from "../../components/Button.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { CheckIcon } from "../../components/icons.tsx"
import { WaitlistButton } from "../../components/WaitlistButton.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { localizedPath } from "../../i18n/locale.ts"
import type { MessageKey } from "../../i18n/messages.ts"
import { cx } from "../../lib/cx.ts"

type FreePlanCard = {
  id: "free"
  waitlist: false
  eyebrowKey: MessageKey
  priceKey: MessageKey
  descriptionKey: MessageKey
  featureKeys: MessageKey[]
}

type WaitlistPlanCard = {
  id: WaitlistPlanId
  waitlist: true
  dark: boolean
  eyebrowKey: MessageKey
  priceKey: MessageKey
  descriptionKey: MessageKey
  featureKeys: MessageKey[]
}

type PlanCard = FreePlanCard | WaitlistPlanCard

const plans: PlanCard[] = [
  {
    id: "free",
    waitlist: false,
    eyebrowKey: "pricing.free.eyebrow",
    priceKey: "pricing.free.price",
    descriptionKey: "pricing.free.description",
    featureKeys: [
      "pricing.free.feature1",
      "pricing.free.feature2",
      "pricing.free.feature3",
      "pricing.free.feature4",
      "pricing.free.feature5",
    ],
  },
  {
    id: "pro",
    waitlist: true,
    dark: true,
    eyebrowKey: "pricing.pro.eyebrow",
    priceKey: "pricing.planned",
    descriptionKey: "pricing.pro.description",
    featureKeys: ["pricing.pro.feature1", "pricing.pro.feature2", "pricing.pro.feature3"],
  },
  {
    id: "metered",
    waitlist: true,
    dark: false,
    eyebrowKey: "pricing.metered.eyebrow",
    priceKey: "pricing.planned",
    descriptionKey: "pricing.metered.description",
    featureKeys: ["pricing.metered.feature1", "pricing.metered.feature2"],
  },
]

const faqs = [
  { questionKey: "pricing.faq.q1", answerKey: "pricing.faq.a1" },
  { questionKey: "pricing.faq.q5", answerKey: "pricing.faq.a5" },
  { questionKey: "pricing.faq.q2", answerKey: "pricing.faq.a2" },
  { questionKey: "pricing.faq.q3", answerKey: "pricing.faq.a3" },
  { questionKey: "pricing.faq.q4", answerKey: "pricing.faq.a4" },
] as const satisfies ReadonlyArray<{ questionKey: MessageKey; answerKey: MessageKey }>

const PlanCardView = ({ plan }: { plan: PlanCard }) => {
  const { locale, t } = useI18n()
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
          {t("pricing.planned")}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <Eyebrow tone={dark ? "night" : "paper"}>{t(plan.eyebrowKey)}</Eyebrow>
        <p className="flex items-baseline gap-2">
          <span id={`plan-${plan.id}`} className="font-display text-display-lg leading-none">
            {t(plan.priceKey)}
          </span>
        </p>
        <p className={cx("text-ui", dark ? "text-night-muted" : "text-ink-secondary")}>{t(plan.descriptionKey)}</p>
      </div>
      <ul className="flex flex-col gap-3 text-body leading-normal">
        {plan.featureKeys.map((featureKey) => (
          <li key={featureKey} className="flex gap-2.5">
            <CheckIcon label={t("pricing.included")} className={cx("mt-0.5 size-4.5 shrink-0", dark ? "text-jade-bright" : "text-jade")} />
            <span>{t(featureKey)}</span>
          </li>
        ))}
      </ul>
      {plan.waitlist ? (
        <WaitlistButton planId={plan.id} dark={dark} className="mt-auto" />
      ) : (
        <LinkButton to={localizedPath("/", locale)} variant="outline" size="lg" className="mt-auto w-full">
          {t("pricing.start")}
        </LinkButton>
      )}
    </article>
  )
}

export const PricingPage = () => {
  const { t } = useI18n()
  usePageMeta("pricing")
  return (
    <Container>
      <section className="flex flex-col gap-4 pb-8 pt-10 md:items-center md:pb-12 md:pt-18 md:text-center">
        <h1 className="font-display text-display-sm text-ink md:text-display-xl">{t("pricing.title")}</h1>
        <p className="max-w-lede-sm text-body text-pretty text-ink-secondary md:text-lede">{t("pricing.lede")}</p>
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch md:gap-6">
        {plans.map((plan) => (
          <PlanCardView key={plan.id} plan={plan} />
        ))}
      </div>
      <section aria-label={t("pricing.faq.aria")} className="grid grid-cols-1 gap-6 pt-12 md:grid-cols-3 md:pt-18">
        {faqs.map((faq) => (
          <div key={faq.questionKey} className="flex flex-col gap-2 border-t-thin border-hairline pt-4.5">
            <h2 className="text-ui-lg font-medium text-ink">{t(faq.questionKey)}</h2>
            <p className="text-ui leading-prose text-ink-secondary">{t(faq.answerKey)}</p>
          </div>
        ))}
      </section>
    </Container>
  )
}

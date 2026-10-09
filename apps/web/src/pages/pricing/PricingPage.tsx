import { Link } from "react-router"
import { usePageMeta } from "../../app/usePageMeta.ts"
import { LinkButton } from "../../components/Button.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { CheckIcon } from "../../components/icons.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { localizedPath } from "../../i18n/locale.ts"
import { plans, pricingEntries, pricingFaqs, type PlanCard } from "../../lib/pricingData.ts"

const PlanCardView = ({ plan }: { plan: PlanCard }) => {
  const { locale, t } = useI18n()
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className="flex flex-col gap-5.5 rounded-card border-thin border-hairline bg-surface p-6 text-ink md:p-8"
    >
      <div className="flex flex-col gap-2">
        <Eyebrow>{t(plan.eyebrowKey)}</Eyebrow>
        <p className="flex items-baseline gap-2">
          <span id={`plan-${plan.id}`} className="font-display text-display-lg leading-none">
            {t(plan.priceKey)}
          </span>
        </p>
        <p className="text-ui text-ink-secondary">{t(plan.descriptionKey)}</p>
      </div>
      <ul className="flex flex-col gap-3 text-body leading-normal">
        {plan.featureKeys.map((featureKey) => (
          <li key={featureKey} className="flex gap-2.5">
            <CheckIcon label={t("pricing.included")} className="mt-0.5 size-4.5 shrink-0 text-jade" />
            <span>{t(featureKey)}</span>
          </li>
        ))}
      </ul>
      <LinkButton to={localizedPath("/", locale)} variant="outline" size="lg" className="mt-auto w-full">
        {t("pricing.start")}
      </LinkButton>
    </article>
  )
}

export const PricingPage = () => {
  const { locale, t } = useI18n()
  usePageMeta("pricing")
  return (
    <Container>
      <section className="flex flex-col gap-4 pb-8 pt-10 md:items-center md:pb-12 md:pt-18 md:text-center">
        <h1 className="font-display text-display-sm text-ink md:text-display-xl">{t("pricing.title")}</h1>
        <p className="max-w-lede-sm text-body text-pretty text-ink-secondary md:text-lede">{t("pricing.lede")}</p>
      </section>
      <div className="mx-auto grid w-full max-w-card grid-cols-1">
        {plans.map((plan) => (
          <PlanCardView key={plan.id} plan={plan} />
        ))}
      </div>
      <p className="pt-4 text-center text-label text-ink-secondary">
        {t("pricing.entry.lead")}{" "}
        {pricingEntries.map((entry, index) => (
          <span key={entry.key}>
            {index > 0 && " · "}
            <Link to={localizedPath(entry.to, locale)} className="text-vermilion transition-colors hover:text-vermilion-hover">
              {t(entry.key)}
            </Link>
          </span>
        ))}
      </p>
      <section aria-label={t("pricing.faq.aria")} className="grid grid-cols-1 gap-6 pt-12 md:grid-cols-3 md:pt-18">
        {pricingFaqs.map((faq) => (
          <div key={faq.questionKey} className="flex flex-col gap-2 border-t-thin border-hairline pt-4.5">
            <h2 className="text-ui-lg font-medium text-ink">{t(faq.questionKey)}</h2>
            <p className="text-ui leading-prose text-ink-secondary">{t(faq.answerKey)}</p>
          </div>
        ))}
      </section>
    </Container>
  )
}

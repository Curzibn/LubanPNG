import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import type { MessageKey } from "../../i18n/messages.ts"
import { cx } from "../../lib/cx.ts"

type Step = {
  format: string
  formatKey?: MessageKey
  titleKey: MessageKey
  bodyKey: MessageKey
  bodyMobileKey: MessageKey
  accent: boolean
}

const steps: Step[] = [
  {
    format: "PNG",
    titleKey: "process.png.title",
    bodyKey: "process.png.body",
    bodyMobileKey: "process.png.bodyMobile",
    accent: false,
  },
  {
    format: "JPEG",
    titleKey: "process.jpeg.title",
    bodyKey: "process.jpeg.body",
    bodyMobileKey: "process.jpeg.bodyMobile",
    accent: true,
  },
  {
    format: "GIF",
    titleKey: "process.gif.title",
    bodyKey: "process.gif.body",
    bodyMobileKey: "process.gif.bodyMobile",
    accent: false,
  },
  {
    format: "WebP",
    titleKey: "process.webp.title",
    bodyKey: "process.webp.body",
    bodyMobileKey: "process.webp.bodyMobile",
    accent: false,
  },
  {
    format: "AVIF",
    titleKey: "process.avif.title",
    bodyKey: "process.avif.body",
    bodyMobileKey: "process.avif.bodyMobile",
    accent: false,
  },
  {
    format: "",
    formatKey: "process.convert.label",
    titleKey: "process.convert.title",
    bodyKey: "process.convert.body",
    bodyMobileKey: "process.convert.bodyMobile",
    accent: true,
  },
]

export const ProcessSection = () => {
  const { t } = useI18n()
  return (
    <Container className="pt-12 md:pt-24">
      <section aria-labelledby="process-heading" className="flex flex-col gap-4 md:items-center md:gap-9">
        <div className="flex flex-col gap-3 md:items-center">
          <Eyebrow size="responsive">{t("process.eyebrow")}</Eyebrow>
          <h2 id="process-heading" className="hidden font-display text-display-md text-ink md:block">
            {t("process.heading")}
          </h2>
        </div>
        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {steps.map((step) => (
            <article
              key={step.titleKey}
              className={cx(
                "flex flex-col gap-1.5 border-t-rule bg-surface p-4.5 md:gap-3.5 md:p-7",
                step.accent ? "border-vermilion" : "border-ink",
              )}
            >
              <p className="font-mono text-label-sm font-semibold text-ink md:text-label">
                {step.formatKey === undefined ? step.format : t(step.formatKey)}
              </p>
              <h3 className="text-body-lg font-medium text-ink md:text-heading-sm">{t(step.titleKey)}</h3>
              <p className="text-ui leading-relaxed text-ink-secondary md:text-body">
                <span className="md:hidden">{t(step.bodyMobileKey)}</span>
                <span className="hidden md:inline">{t(step.bodyKey)}</span>
              </p>
            </article>
          ))}
        </div>
      </section>
    </Container>
  )
}

import { usePageMeta } from "../app/usePageMeta.ts"
import { LinkButton } from "../components/Button.tsx"
import { Container } from "../components/Container.tsx"
import { Eyebrow } from "../components/Eyebrow.tsx"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { localizedPath } from "../i18n/locale.ts"

export const NotFoundPage = () => {
  const { locale, t } = useI18n()
  usePageMeta("notFound")
  return (
    <Container className="pt-16 md:pt-24">
      <div className="flex flex-col items-start gap-4">
        <Eyebrow>404</Eyebrow>
        <h1 className="font-display text-display-sm text-ink md:text-display-md">{t("nf.title")}</h1>
        <p className="text-body text-ink-secondary">{t("nf.body")}</p>
        <LinkButton to={localizedPath("/", locale)} variant="outline" size="sm" className="mt-2">
          {t("nf.back")}
        </LinkButton>
      </div>
    </Container>
  )
}

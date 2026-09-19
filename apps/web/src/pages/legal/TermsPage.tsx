import { useI18n } from "../../i18n/I18nProvider.tsx"
import type { MessageKey } from "../../i18n/messages.ts"
import { LegalPage } from "./LegalPage.tsx"

const paragraphKeys = [
  "legal.terms.p1",
  "legal.terms.p2",
  "legal.terms.p3",
  "legal.terms.p4",
] as const satisfies ReadonlyArray<MessageKey>

export const TermsPage = () => {
  const { t } = useI18n()
  return (
    <LegalPage
      metaId="terms"
      eyebrow={t("legal.eyebrow")}
      title={t("legal.terms.title")}
      paragraphs={paragraphKeys.map((key) => t(key))}
    />
  )
}

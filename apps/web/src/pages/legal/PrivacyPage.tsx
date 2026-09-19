import { useI18n } from "../../i18n/I18nProvider.tsx"
import type { MessageKey } from "../../i18n/messages.ts"
import { LegalPage } from "./LegalPage.tsx"

const paragraphKeys = [
  "legal.privacy.p1",
  "legal.privacy.p2",
  "legal.privacy.p3",
  "legal.privacy.p4",
  "legal.privacy.p5",
] as const satisfies ReadonlyArray<MessageKey>

export const PrivacyPage = () => {
  const { t } = useI18n()
  return (
    <LegalPage
      metaId="privacy"
      eyebrow={t("legal.eyebrow")}
      title={t("legal.privacy.title")}
      paragraphs={paragraphKeys.map((key) => t(key))}
    />
  )
}

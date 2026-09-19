import { LinkButton } from "../../components/Button.tsx"
import { CodeBlock } from "../../components/CodeBlock.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { localizedPath } from "../../i18n/locale.ts"
import { CLI_INSTALL_COMMAND } from "../../lib/cliRelease.ts"

const curlSample = (origin: string): string =>
  [
    `curl -X POST ${origin}/v1/images/compress \\`,
    '  -H "Authorization: Bearer lp_live_…" \\',
    '  -F "file=@photo.png"',
    "",
    '{ "code": 0, "data": { "task_id": "550e…" } }',
  ].join("\n")

export const IntegrationTeaser = () => {
  const { locale, t } = useI18n()
  const origin = window.location.origin
  return (
    <Container className="pt-12 md:pt-24">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <section aria-labelledby="api-teaser-heading" className="flex flex-col gap-4 rounded-card bg-night p-5 text-night-text md:gap-4.5 md:p-8">
          <Eyebrow tone="night">API</Eyebrow>
          <h2 id="api-teaser-heading" className="text-heading-sm font-medium md:text-heading">
            {t("teaser.api.title")}
          </h2>
          <CodeBlock tone="nightInset" label={t("teaser.api.curlLabel")}>
            {curlSample(origin)}
          </CodeBlock>
          <div className="flex flex-col items-start gap-3 text-ui md:flex-row md:items-center md:gap-4">
            <LinkButton to={localizedPath("/developers", locale)} variant="outlineNight" size="sm">
              {t("teaser.api.docs")}
            </LinkButton>
            <p className="text-night-muted">{t("teaser.api.note")}</p>
          </div>
        </section>
        <section aria-labelledby="cli-teaser-heading" className="flex flex-col gap-4 rounded-card border-thin border-hairline bg-surface p-5 md:gap-4.5 md:p-8">
          <Eyebrow>CLI</Eyebrow>
          <h2 id="cli-teaser-heading" className="text-heading-sm font-medium text-ink md:text-heading">
            {t("teaser.cli.title")}
          </h2>
          <CodeBlock tone="panel" label={t("teaser.cli.sampleLabel")}>
            {t("teaser.cli.sample")}
          </CodeBlock>
          <div className="flex flex-col items-start gap-3 text-ui md:flex-row md:items-center md:gap-4">
            <code className="rounded-control border-thin border-hairline bg-panel px-3 py-2 font-mono text-ui text-ink">
              {CLI_INSTALL_COMMAND}
            </code>
            <p className="text-ink-secondary">{t("dev.cli.platforms")}</p>
          </div>
        </section>
      </div>
    </Container>
  )
}

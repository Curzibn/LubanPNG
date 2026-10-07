import { useEffect, useState, type ReactNode } from "react"
import { usePageMeta } from "../../app/usePageMeta.ts"
import { CodeBlock } from "../../components/CodeBlock.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { ExternalLinkIcon } from "../../components/icons.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import type { MessageKey } from "../../i18n/messages.ts"
import {
  agentChannelRows,
  cliRows,
  convertSample,
  downloadSample,
  endpointRows,
  errorRows,
  formatRows,
  quotaHeadersSample,
  statusSample,
  upscaleLimitRows,
  upscaleSample,
  upscaleStatusSample,
  uploadSample,
} from "../../lib/apiDocs.ts"
import { CLI_INSTALL_COMMAND } from "../../lib/cliRelease.ts"
import { Table, Td, Th } from "../../components/Table.tsx"
import { cx } from "../../lib/cx.ts"

const sections = [
  { id: "auth", labelKey: "dev.section.auth" },
  { id: "quickstart", labelKey: "dev.section.quickstart" },
  { id: "endpoints", labelKey: "dev.section.endpoints" },
  { id: "convert", labelKey: "dev.section.convert" },
  { id: "upscale", labelKey: "dev.section.upscale" },
  { id: "quota", labelKey: "dev.section.quota" },
  { id: "agents", labelKey: "dev.section.agents" },
  { id: "cli", labelKey: "dev.section.cli" },
] as const satisfies ReadonlyArray<{ id: string; labelKey: MessageKey }>

type SectionId = (typeof sections)[number]["id"]

const ACTIVE_OFFSET = 160
const FIRST_SECTION: SectionId = "auth"
const LAST_SECTION: SectionId = "cli"

const scrolledToBottom = (): boolean =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1

const useActiveSection = (): SectionId => {
  const [active, setActive] = useState<SectionId>(FIRST_SECTION)
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      if (scrolledToBottom()) {
        setActive(LAST_SECTION)
        return
      }
      let current: SectionId = FIRST_SECTION
      for (const section of sections) {
        const element = document.getElementById(section.id)
        if (element && element.getBoundingClientRect().top <= ACTIVE_OFFSET) current = section.id
      }
      setActive(current)
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])
  return active
}

const Sidebar = ({ active }: { active: SectionId }) => {
  const { t } = useI18n()
  return (
    <nav aria-label={t("dev.toc.aria")} className="flex flex-col gap-1 lg:sticky lg:top-6 lg:self-start">
      <Eyebrow size="sm" className="px-3 pb-2.5">
        {t("dev.toc")}
      </Eyebrow>
      <div className="flex flex-wrap gap-x-1 lg:flex-col lg:gap-0">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active === section.id ? "location" : undefined}
            className={cx(
              "flex min-h-control items-center border-l-rule px-3 text-ui transition-colors lg:min-h-0 lg:py-2",
              active === section.id ? "border-vermilion font-medium text-ink" : "border-transparent text-ink-secondary hover:text-ink",
            )}
          >
            {t(section.labelKey)}
          </a>
        ))}
      </div>
      <a
        href="/swagger-ui"
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex min-h-control items-center gap-1.5 px-3 text-ui text-vermilion hover:text-vermilion-hover lg:mt-4 lg:min-h-0 lg:py-2"
      >
        {t("dev.openapi")}
        <ExternalLinkIcon label={t("dev.external")} className="size-3.5" />
      </a>
    </nav>
  )
}

const Section = ({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) => (
  <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-3.5">
    <h2 id={`${id}-title`} className="text-heading-sm font-medium text-ink md:text-heading">
      {title}
    </h2>
    {children}
  </section>
)

const Step = ({ number, children }: { number: number; children: ReactNode }) => (
  <p className="flex items-baseline gap-3.5">
    <span className="w-4.5 shrink-0 font-mono text-label-sm text-ink-secondary">{number}</span>
    <span className="text-body text-ink">{children}</span>
  </p>
)

const Prose = ({ children }: { children: ReactNode }) => <p className="text-body text-ink-secondary">{children}</p>

export const DevelopersPage = () => {
  const { t } = useI18n()
  usePageMeta("developers")
  const active = useActiveSection()
  const origin = window.location.origin
  return (
    <Container className="pt-8 md:pt-14">
      <div className="flex flex-col gap-8 lg:grid lg:grid-developers lg:gap-16">
        <Sidebar active={active} />
        <div className="flex max-w-prose flex-col gap-10 md:gap-14">
          <header className="flex flex-col gap-3.5">
            <h1 className="font-display text-display-sm text-ink md:text-display-lg">{t("dev.title")}</h1>
            <p className="text-body text-ink-secondary md:text-body-lg">{t("dev.intro")}</p>
          </header>

          <Section id="auth" title={t("dev.section.auth")}>
            <Prose>{t("dev.auth.body")}</Prose>
            <CodeBlock label={t("dev.auth.codeLabel")}>Authorization: Bearer lp_live_a8f3k2…</CodeBlock>
          </Section>

          <Section id="quickstart" title={t("dev.section.quickstart")}>
            <div className="flex flex-col gap-3">
              <Step number={1}>{t("dev.step1")}</Step>
              <CodeBlock label={t("dev.code.upload")}>{uploadSample(origin)}</CodeBlock>
              <Step number={2}>{t("dev.step2")}</Step>
              <CodeBlock label={t("dev.code.status")}>{statusSample(origin)}</CodeBlock>
              <Step number={3}>{t("dev.step3")}</Step>
              <CodeBlock label={t("dev.code.download")}>{downloadSample(origin)}</CodeBlock>
            </div>
          </Section>

          <Section id="endpoints" title={t("dev.section.endpoints")}>
            <Table label={t("dev.endpoints.aria")}>
              <thead>
                <tr>
                  <Th>{t("dev.endpoints.method")}</Th>
                  <Th>{t("dev.endpoints.path")}</Th>
                  <Th>{t("dev.endpoints.auth")}</Th>
                </tr>
              </thead>
              <tbody>
                {endpointRows.map((row) => (
                  <tr key={`${row.method} ${row.path}`}>
                    <Td className="font-mono font-semibold">{row.method}</Td>
                    <Td>
                      <span className="font-mono">{row.path}</span>
                      <span className="text-ink-secondary"> · {t(row.purposeKey)}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-secondary">{t(row.authKey)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="convert" title={t("dev.section.convert")}>
            <Prose>{t("dev.convert.body")}</Prose>
            <CodeBlock label={t("dev.convert.codeLabel")}>{convertSample(origin)}</CodeBlock>
            <Table label={t("dev.formats.aria")}>
              <thead>
                <tr>
                  <Th>{t("dev.formats.format")}</Th>
                  <Th>{t("dev.formats.input")}</Th>
                  <Th>{t("dev.formats.output")}</Th>
                  <Th>{t("dev.formats.note")}</Th>
                </tr>
              </thead>
              <tbody>
                {formatRows.map((row) => (
                  <tr key={row.format}>
                    <Td className="whitespace-nowrap font-mono">{row.format}</Td>
                    <Td className="whitespace-nowrap">{t(row.inputKey)}</Td>
                    <Td className="whitespace-nowrap">{t(row.outputKey)}</Td>
                    <Td className="text-ink-secondary">{t(row.noteKey)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="upscale" title={t("dev.section.upscale")}>
            <Prose>{t("dev.upscale.body")}</Prose>
            <CodeBlock label={t("dev.upscale.codeLabel")}>{upscaleSample(origin)}</CodeBlock>
            <CodeBlock label={t("dev.upscale.statusLabel")}>{upscaleStatusSample(origin)}</CodeBlock>
            <Table label={t("dev.upscale.limits.aria")}>
              <thead>
                <tr>
                  <Th>{t("dev.upscale.limits.item")}</Th>
                  <Th>{t("dev.upscale.limits.value")}</Th>
                </tr>
              </thead>
              <tbody>
                {upscaleLimitRows.map((row) => (
                  <tr key={row.itemKey}>
                    <Td className="whitespace-nowrap text-ink-secondary">{t(row.itemKey)}</Td>
                    <Td>{t(row.valueKey)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Prose>{t("dev.upscale.queue")}</Prose>
            <Prose>{t("dev.upscale.billing")}</Prose>
          </Section>

          <Section id="quota" title={t("dev.section.quota")}>
            <Prose>{t("dev.quota.body")}</Prose>
            <CodeBlock tone="panel" label={t("dev.quota.codeLabel")}>
              {quotaHeadersSample}
            </CodeBlock>
            <Table label={t("dev.errors.aria")}>
              <thead>
                <tr>
                  <Th>HTTP</Th>
                  <Th>code</Th>
                  <Th>{t("dev.errors.meaning")}</Th>
                </tr>
              </thead>
              <tbody>
                {errorRows.map((row) => (
                  <tr key={row.code}>
                    <Td className="font-mono">{row.http}</Td>
                    <Td className="font-mono">{row.code}</Td>
                    <Td>{t(row.meaningKey)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="agents" title={t("dev.section.agents")}>
            <Prose>{t("dev.agents.body")}</Prose>
            <div className="flex flex-col gap-1 lg:flex-row lg:gap-6">
              <a
                href="/llms.txt"
                className="flex min-h-control w-fit items-center text-ui text-vermilion hover:text-vermilion-hover lg:min-h-0"
              >
                {t("dev.agents.llms")}
              </a>
              <a
                href="/api-doc/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="flex min-h-control w-fit items-center gap-1.5 text-ui text-vermilion hover:text-vermilion-hover lg:min-h-0"
              >
                {t("dev.agents.openapi")}
                <ExternalLinkIcon label={t("dev.external")} className="size-3.5" />
              </a>
            </div>
            <Table label={t("dev.agents.aria")}>
              <thead>
                <tr>
                  <Th>{t("dev.agents.channel")}</Th>
                  <Th>{t("dev.agents.status")}</Th>
                  <Th>{t("dev.agents.note")}</Th>
                </tr>
              </thead>
              <tbody>
                {agentChannelRows.map((row) => (
                  <tr key={row.channelKey}>
                    <Td className="whitespace-nowrap font-mono">{t(row.channelKey)}</Td>
                    <Td className="whitespace-nowrap text-ink-secondary">{t(row.statusKey)}</Td>
                    <Td className="text-ink-secondary">{t(row.noteKey)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="cli" title={t("dev.section.cli")}>
            <Prose>{t("dev.cli.body")}</Prose>
            <CodeBlock label={t("dev.cli.installLabel")}>{CLI_INSTALL_COMMAND}</CodeBlock>
            <Prose>{t("dev.cli.platforms")}</Prose>
            <CodeBlock label={t("dev.cli.sampleLabel")}>{t("dev.cli.sample")}</CodeBlock>
            <Table label={t("dev.cli.tableAria")}>
              <tbody>
                {cliRows.map((row) => (
                  <tr key={row.command}>
                    <Td className="whitespace-nowrap font-mono">{row.command}</Td>
                    <Td className="text-ink-secondary">{t(row.meaningKey)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        </div>
      </div>
    </Container>
  )
}

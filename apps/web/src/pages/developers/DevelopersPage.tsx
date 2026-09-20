import { tokens } from "@lubanpng/design-tokens/tokens"
import { useEffect, useState, type ReactNode } from "react"
import { usePageMeta } from "../../app/usePageMeta.ts"
import { CodeBlock } from "../../components/CodeBlock.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { ExternalLinkIcon } from "../../components/icons.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import type { MessageKey } from "../../i18n/messages.ts"
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

const endpointRows: ReadonlyArray<{ method: string; path: string; purposeKey: MessageKey; authKey: MessageKey }> = [
  { method: "POST", path: "/v1/images/compress", purposeKey: "dev.endpoints.p1", authKey: "dev.auth.keySessionAnon" },
  { method: "POST", path: "/v1/images/upscale", purposeKey: "dev.endpoints.upscale", authKey: "dev.auth.keySessionAnon" },
  { method: "GET", path: "/v1/images/compress/{task_id}", purposeKey: "dev.endpoints.p2", authKey: "dev.auth.same" },
  { method: "GET", path: "/v1/images/download/{filename}", purposeKey: "dev.endpoints.p3", authKey: "dev.auth.same" },
  { method: "GET", path: "/v1/me", purposeKey: "dev.endpoints.p4", authKey: "dev.auth.same" },
  { method: "POST", path: "/v1/auth/otp", purposeKey: "dev.endpoints.p5", authKey: "dev.auth.none" },
  { method: "POST", path: "/v1/auth/verify", purposeKey: "dev.endpoints.p6", authKey: "dev.auth.none" },
  { method: "GET", path: "/v1/me/api-keys", purposeKey: "dev.endpoints.p7", authKey: "dev.auth.session" },
]

const errorRows: ReadonlyArray<{ http: string; code: string; meaningKey: MessageKey }> = [
  { http: "400", code: "1001", meaningKey: "dev.error.e1" },
  { http: "413", code: "1004", meaningKey: "dev.error.e2" },
  { http: "401", code: "4001", meaningKey: "dev.error.e3" },
  { http: "429", code: "4003", meaningKey: "dev.error.e4" },
  { http: "404", code: "3003", meaningKey: "dev.error.e5" },
  { http: "500", code: "2002", meaningKey: "dev.error.e6" },
]

const cliRows: ReadonlyArray<{ command: string; meaningKey: MessageKey }> = [
  { command: "login / logout", meaningKey: "dev.cli.login" },
  { command: "compress", meaningKey: "dev.cli.compress" },
  { command: "usage", meaningKey: "dev.cli.usage" },
]

const uploadSample = (origin: string) =>
  [
    `curl -X POST ${origin}/v1/images/compress \\`,
    '  -H "Authorization: Bearer lp_live_…" \\',
    '  -F "file=@photo.png"',
    "",
    '{ "code": 0, "msg": "success", "data": { "task_id": "550e8400-…" } }',
  ].join("\n")

const statusSample = (origin: string) =>
  [
    `curl "${origin}/v1/images/compress/550e8400-…?wait=30" \\`,
    '  -H "Authorization: Bearer lp_live_…"',
    "",
    '{ "code": 0, "data": { "status": "completed",',
    '    "original_size": 2516582, "compressed_size": 933241,',
    '    "output_format": "jpeg", "quota_units": 1,',
    '    "compressed_url": "/v1/images/download/550e8400-….jpg" } }',
  ].join("\n")

const convertSample = (origin: string) =>
  [
    `curl -X POST ${origin}/v1/images/compress \\`,
    '  -H "Authorization: Bearer lp_live_…" \\',
    '  -F "file=@cutout.png" \\',
    '  -F "convert=jpeg" \\',
    `  -F "background=${tokens.color.surface.toLowerCase()}"`,
    "",
    '{ "code": 0, "data": { "status": "completed", "target_format": "jpeg",',
    '    "output_format": "jpeg", "quota_units": 2,',
    '    "compressed_url": "/v1/images/download/550e8400-….jpg" } }',
  ].join("\n")

const upscaleSample = (origin: string) =>
  [
    `curl -X POST ${origin}/v1/images/upscale \\`,
    '  -H "Authorization: Bearer lp_live_…" \\',
    '  -F "file=@logo.png" \\',
    '  -F "scale=x2"',
    "",
    '{ "code": 0, "msg": "success", "data": { "task_id": "550e8400-…" } }',
  ].join("\n")

const upscaleStatusSample = (origin: string) =>
  [
    `curl "${origin}/v1/images/compress/550e8400-…?wait=30" \\`,
    '  -H "Authorization: Bearer lp_live_…"',
    "",
    '{ "code": 0, "data": { "status": "completed", "kind": "upscale",',
    '    "scale": "x2", "original_size": 398829, "compressed_size": 1194351,',
    '    "output_format": "png", "quota_units": 1, "no_gain": false,',
    '    "compressed_url": "/v1/images/download/550e8400-….png" } }',
  ].join("\n")

const upscaleLimitRows: ReadonlyArray<{ itemKey: MessageKey; valueKey: MessageKey }> = [
  { itemKey: "dev.upscale.limits.input", valueKey: "dev.upscale.limits.inputValue" },
  { itemKey: "dev.upscale.limits.scale", valueKey: "dev.upscale.limits.scaleValue" },
  { itemKey: "dev.upscale.limits.size", valueKey: "dev.upscale.limits.sizeValue" },
  { itemKey: "dev.upscale.limits.dimensions", valueKey: "dev.upscale.limits.dimensionsValue" },
  { itemKey: "dev.upscale.limits.output", valueKey: "dev.upscale.limits.outputValue" },
]

const agentChannelRows: ReadonlyArray<{ channelKey: MessageKey; statusKey: MessageKey; noteKey: MessageKey }> = [
  { channelKey: "dev.agents.rest", statusKey: "dev.agents.restStatus", noteKey: "dev.agents.restNote" },
  { channelKey: "dev.agents.mcp", statusKey: "dev.agents.mcpStatus", noteKey: "dev.agents.mcpNote" },
  { channelKey: "dev.agents.x402", statusKey: "dev.agents.x402Status", noteKey: "dev.agents.x402Note" },
]

const formatRows: ReadonlyArray<{
  format: string
  inputKey: MessageKey
  outputKey: MessageKey
  noteKey: MessageKey
}> = [
  { format: "PNG / APNG", inputKey: "dev.formats.supported", outputKey: "dev.formats.supported", noteKey: "dev.format.png.note" },
  { format: "JPEG", inputKey: "dev.formats.supported", outputKey: "dev.formats.supported", noteKey: "dev.format.jpeg.note" },
  { format: "GIF", inputKey: "dev.formats.supported", outputKey: "dev.formats.notTarget", noteKey: "dev.format.gif.note" },
  { format: "WebP", inputKey: "dev.formats.supported", outputKey: "dev.formats.supported", noteKey: "dev.format.webp.note" },
  { format: "AVIF", inputKey: "dev.formats.supported", outputKey: "dev.formats.supported", noteKey: "dev.format.avif.note" },
  {
    format: "HEIC / HEIF",
    inputKey: "dev.formats.apiUnsupported",
    outputKey: "dev.formats.unsupported",
    noteKey: "dev.format.heic.note",
  },
]

const downloadSample = (origin: string) => `curl -o photo.min.jpg "${origin}/v1/images/download/550e8400-….jpg"`

const quotaHeadersSample = ["X-Quota-Limit: 50", "X-Quota-Remaining: 46", "X-Quota-Reset: 2026-10-01T00:00:00Z"].join("\n")

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

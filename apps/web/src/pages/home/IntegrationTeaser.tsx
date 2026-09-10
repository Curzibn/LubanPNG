import { LinkButton } from "../../components/Button.tsx"
import { CodeBlock } from "../../components/CodeBlock.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { CLI_INSTALL_COMMAND, CLI_PLATFORMS } from "../../lib/cliRelease.ts"

const curlSample = (origin: string): string =>
  [
    `curl -X POST ${origin}/v1/images/compress \\`,
    '  -H "Authorization: Bearer lp_live_…" \\',
    '  -F "file=@photo.png"',
    "",
    '{ "code": 0, "data": { "task_id": "550e…" } }',
  ].join("\n")

const cliSample = [
  "$ lubanpng login",
  "$ lubanpng compress ./images --out ./dist",
  "",
  "  photo_banner.jpg   2.40 MB → 0.89 MB   -63%",
  "  logo@2x.png         312 KB →   96 KB   -69%",
  "  本次 2 张，节省 1.72 MB，本月剩余 46 次",
].join("\n")

export const IntegrationTeaser = () => {
  const origin = window.location.origin
  return (
    <Container className="pt-12 md:pt-24">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <section aria-labelledby="api-teaser-heading" className="flex flex-col gap-4 rounded-card bg-night p-5 text-night-text md:gap-4.5 md:p-8">
          <Eyebrow tone="night">API</Eyebrow>
          <h2 id="api-teaser-heading" className="text-heading-sm font-medium md:text-heading">
            三个请求，接进你的流水线
          </h2>
          <CodeBlock tone="nightInset" label="curl 示例">
            {curlSample(origin)}
          </CodeBlock>
          <div className="flex flex-col items-start gap-3 text-ui md:flex-row md:items-center md:gap-4">
            <LinkButton to="/developers" variant="outlineNight" size="sm">
              查看 API 文档
            </LinkButton>
            <p className="text-night-muted">注册即送每月 50 次，网页与 API 共用。</p>
          </div>
        </section>
        <section aria-labelledby="cli-teaser-heading" className="flex flex-col gap-4 rounded-card border-thin border-hairline bg-surface p-5 md:gap-4.5 md:p-8">
          <Eyebrow>CLI</Eyebrow>
          <h2 id="cli-teaser-heading" className="text-heading-sm font-medium text-ink md:text-heading">
            整个目录，一条命令
          </h2>
          <CodeBlock tone="panel" label="CLI 示例">
            {cliSample}
          </CodeBlock>
          <div className="flex flex-col items-start gap-3 text-ui md:flex-row md:items-center md:gap-4">
            <code className="rounded-control border-thin border-hairline bg-panel px-3 py-2 font-mono text-ui text-ink">
              {CLI_INSTALL_COMMAND}
            </code>
            <p className="text-ink-secondary">{CLI_PLATFORMS}</p>
          </div>
        </section>
      </div>
    </Container>
  )
}

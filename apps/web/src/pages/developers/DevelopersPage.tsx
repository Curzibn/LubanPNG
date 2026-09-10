import { useEffect, useState, type ReactNode } from "react"
import { usePageTitle } from "../../app/usePageTitle.ts"
import { CodeBlock } from "../../components/CodeBlock.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { ExternalLinkIcon } from "../../components/icons.tsx"
import { Table, Td, Th } from "../../components/Table.tsx"
import { cx } from "../../lib/cx.ts"

const sections = [
  { id: "auth", label: "认证" },
  { id: "quickstart", label: "快速开始" },
  { id: "endpoints", label: "端点" },
  { id: "quota", label: "额度与错误" },
  { id: "cli", label: "CLI" },
] as const

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

const Sidebar = ({ active }: { active: SectionId }) => (
  <nav aria-label="文档目录" className="flex flex-col gap-1 lg:sticky lg:top-6 lg:self-start">
    <Eyebrow size="sm" className="px-3 pb-2.5">
      目录
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
          {section.label}
        </a>
      ))}
    </div>
    <a
      href="/swagger-ui"
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex min-h-control items-center gap-1.5 px-3 text-ui text-vermilion hover:text-vermilion-hover lg:mt-4 lg:min-h-0 lg:py-2"
    >
      完整 OpenAPI 参考
      <ExternalLinkIcon label="外部链接" className="size-3.5" />
    </a>
  </nav>
)

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

const endpointRows = [
  { method: "POST", path: "/v1/images/compress", purpose: "上传一张图，入队压缩，扣 1 次", auth: "Key / 会话 / 匿名" },
  { method: "GET", path: "/v1/images/compress/{task_id}", purpose: "任务状态，可选 wait 长轮询", auth: "同上" },
  { method: "GET", path: "/v1/images/download/{filename}", purpose: "下载产物", auth: "同上" },
  { method: "GET", path: "/v1/me", purpose: "当前身份、套餐、本期额度与重置时间", auth: "同上" },
  { method: "POST", path: "/v1/auth/otp", purpose: "发送邮箱验证码", auth: "无" },
  { method: "POST", path: "/v1/auth/verify", purpose: "验证码换登录会话", auth: "无" },
  { method: "GET", path: "/v1/me/api-keys", purpose: "列出 Key；POST 新建，DELETE 吊销", auth: "会话" },
]

const errorRows = [
  { http: "400", code: "1001", meaning: "参数错误，如缺少 file 字段" },
  { http: "413", code: "1004", meaning: "文件超过当前套餐上限" },
  { http: "401", code: "4001", meaning: "未登录或 Key 无效、已吊销" },
  { http: "429", code: "4003", meaning: "本期额度用尽，响应里给出重置时间" },
  { http: "404", code: "3003", meaning: "任务或产物不存在、已过期" },
  { http: "500", code: "2002", meaning: "压缩失败，任务标记 failed，不扣次" },
]

const cliRows = [
  { command: "login / logout", meaning: "保存或清除本机 Key；也可用环境变量 LUBANPNG_API_KEY" },
  { command: "compress", meaning: "文件或目录；--out 输出目录，--in-place 原地覆盖，--recursive 递归，--concurrency 并发数" },
  { command: "usage", meaning: "套餐、本期用量与重置时间" },
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
    '    "compressed_url": "/v1/images/download/compressed_550e8400-….jpg" } }',
  ].join("\n")

const downloadSample = (origin: string) =>
  `curl -o photo.min.jpg "${origin}/v1/images/download/compressed_550e8400-….jpg"`

const quotaHeadersSample = ["X-Quota-Limit: 50", "X-Quota-Remaining: 46", "X-Quota-Reset: 2026-10-01T00:00:00Z"].join("\n")

const cliSample = [
  "$ lubanpng login",
  "  粘贴你的 API Key: lp_live_…",
  "  已登录 zibin@example.com · 本月剩余 46 次",
  "",
  "$ lubanpng compress ./images --out ./dist --recursive",
  "  photo_banner.jpg   2.40 MB → 0.89 MB   -63%",
  "  logo@2x.png         312 KB →   96 KB   -69%",
  "  sticker_wave.gif   1.10 MB → 0.71 MB   -36%",
  "  本次 3 张，节省 2.11 MB，本月剩余 43 次",
  "",
  "$ lubanpng usage",
  "  免费套餐 · 本月已用 7 / 50 · 10 月 1 日重置",
].join("\n")

export const DevelopersPage = () => {
  usePageTitle("开发者")
  const active = useActiveSection()
  const origin = window.location.origin
  return (
    <Container className="pt-8 md:pt-14">
      <div className="flex flex-col gap-8 lg:grid lg:grid-developers lg:gap-16">
        <Sidebar active={active} />
        <div className="flex max-w-prose flex-col gap-10 md:gap-14">
          <header className="flex flex-col gap-3.5">
            <h1 className="font-display text-display-sm text-ink md:text-display-lg">开发者</h1>
            <p className="text-body text-ink-secondary md:text-body-lg">
              压缩是异步任务：上传拿到任务号，查询时可以让服务端等到完成再回，再下载产物。三个请求，任何语言都能接。
            </p>
          </header>

          <Section id="auth" title="认证">
            <Prose>在工作台创建 API Key，放进 Authorization 头。Key 只在创建时完整显示一次，服务端只保存散列。</Prose>
            <CodeBlock label="认证头示例">Authorization: Bearer lp_live_a8f3k2…</CodeBlock>
          </Section>

          <Section id="quickstart" title="快速开始">
            <div className="flex flex-col gap-3">
              <Step number={1}>上传图片，拿到任务号</Step>
              <CodeBlock label="上传示例">{uploadSample(origin)}</CodeBlock>
              <Step number={2}>查询结果，带上 wait 让服务端最多等 30 秒</Step>
              <CodeBlock label="查询示例">{statusSample(origin)}</CodeBlock>
              <Step number={3}>下载产物，24 小时内有效</Step>
              <CodeBlock label="下载示例">{downloadSample(origin)}</CodeBlock>
            </div>
          </Section>

          <Section id="endpoints" title="端点">
            <Table label="端点列表">
              <thead>
                <tr>
                  <Th>方法</Th>
                  <Th>路径与用途</Th>
                  <Th>鉴权</Th>
                </tr>
              </thead>
              <tbody>
                {endpointRows.map((row) => (
                  <tr key={`${row.method} ${row.path}`}>
                    <Td className="font-mono font-semibold">{row.method}</Td>
                    <Td>
                      <span className="font-mono">{row.path}</span>
                      <span className="text-ink-secondary"> · {row.purpose}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-secondary">{row.auth}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="quota" title="额度与错误">
            <Prose>每个响应都带三个额度头，扣次发生在任务成功完成时，失败自动退回。</Prose>
            <CodeBlock tone="panel" label="额度响应头">
              {quotaHeadersSample}
            </CodeBlock>
            <Table label="错误码">
              <thead>
                <tr>
                  <Th>HTTP</Th>
                  <Th>code</Th>
                  <Th>含义</Th>
                </tr>
              </thead>
              <tbody>
                {errorRows.map((row) => (
                  <tr key={row.code}>
                    <Td className="font-mono">{row.http}</Td>
                    <Td className="font-mono">{row.code}</Td>
                    <Td>{row.meaning}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="cli" title="CLI">
            <Prose>单文件可执行，走同一套 API 与额度。登录一次，Key 存在本机用户配置目录。</Prose>
            <CodeBlock label="CLI 示例">{cliSample}</CodeBlock>
            <Table label="CLI 命令">
              <tbody>
                {cliRows.map((row) => (
                  <tr key={row.command}>
                    <Td className="whitespace-nowrap font-mono">{row.command}</Td>
                    <Td className="text-ink-secondary">{row.meaning}</Td>
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

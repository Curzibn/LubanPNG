import { tokens } from "@lubanpng/design-tokens/tokens"
import { useEffect, useState, type ReactNode } from "react"
import { usePageTitle } from "../../app/usePageTitle.ts"
import { CodeBlock } from "../../components/CodeBlock.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { ExternalLinkIcon } from "../../components/icons.tsx"
import { CLI_INSTALL_COMMAND, CLI_PLATFORMS } from "../../lib/cliRelease.ts"
import { Table, Td, Th } from "../../components/Table.tsx"
import { cx } from "../../lib/cx.ts"

const sections = [
  { id: "auth", label: "认证" },
  { id: "quickstart", label: "快速开始" },
  { id: "endpoints", label: "端点" },
  { id: "convert", label: "格式转换" },
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
  { method: "POST", path: "/v1/images/compress", purpose: "上传一张图，入队压缩，产出更小文件时计 1 次；带 convert 转换格式再计 1 次", auth: "Key / 会话 / 匿名" },
  { method: "GET", path: "/v1/images/compress/{task_id}", purpose: "任务状态，可选 wait 长轮询", auth: "同上" },
  { method: "GET", path: "/v1/images/download/{filename}", purpose: "下载产物", auth: "同上" },
  { method: "GET", path: "/v1/me", purpose: "当前身份、套餐、本期额度与重置时间", auth: "同上" },
  { method: "POST", path: "/v1/auth/otp", purpose: "发送邮箱验证码", auth: "无" },
  { method: "POST", path: "/v1/auth/verify", purpose: "验证码换登录会话", auth: "无" },
  { method: "GET", path: "/v1/me/api-keys", purpose: "列出 Key；POST 新建，DELETE 吊销", auth: "会话" },
]

const errorRows = [
  { http: "400", code: "1001", meaning: "参数错误，如缺少 file 字段、convert 或 background 不合法、HEIC 等不支持的格式" },
  { http: "413", code: "1004", meaning: "文件超过当前套餐上限" },
  { http: "401", code: "4001", meaning: "未登录或 Key 无效、已吊销" },
  { http: "429", code: "4003", meaning: "本期额度用尽，响应里给出重置时间" },
  { http: "404", code: "3003", meaning: "任务或产物不存在、已过期" },
  { http: "500", code: "2002", meaning: "压缩失败，任务标记 failed，不扣次" },
]

const cliRows = [
  { command: "login / logout", meaning: "保存或清除本机 Key；也可用环境变量 LUBANPNG_API_KEY" },
  {
    command: "compress",
    meaning:
      "文件或目录；--out 输出目录，--in-place 原地覆盖，--recursive 递归，--concurrency 并发数，--convert 转换格式（png / jpeg / webp / avif），--background 透明图转 JPEG 的背景色；macOS 上 HEIC 先由系统转成 JPEG 再上传",
  },
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
    '    "output_format": "jpeg", "quota_units": 1,',
    '    "compressed_url": "/v1/images/download/compressed_550e8400-….jpg" } }',
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

const formatRows = [
  { format: "PNG / APNG", input: "支持", output: "支持", note: "APNG 逐帧量化并保留动画" },
  { format: "JPEG", input: "支持", output: "支持", note: "透明图转 JPEG 需要 background" },
  { format: "GIF", input: "支持", output: "不作为转换目标", note: "动画逐帧量化，帧间隔与循环保留" },
  { format: "WebP", input: "支持", output: "支持", note: "动态 WebP 逐帧重编码" },
  { format: "AVIF", input: "支持", output: "支持", note: "静态图" },
  { format: "HEIC / HEIF", input: "API 不支持", output: "不支持", note: "网页在 iPhone Safari 选图时自动转成 JPEG 上传；CLI 在 macOS 上用系统转换器转成 JPEG 后上传；API 直传返回 1001" },
]

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
  "$ lubanpng compress ./hero.png --convert webp",
  "  hero.png           1.20 MB → 0.31 MB   -74%   → hero.webp",
  "  本次 1 张，节省 0.89 MB，本月剩余 41 次，1 张已转换",
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

          <Section id="convert" title="格式转换">
            <Prose>
              上传时带 convert 字段即可把静态图转成 png、jpeg、webp 或 avif。目标格式与原格式相同时按普通压缩处理，只计 1
              次；不同则在压缩之外额外计 1 次。透明图转 JPEG 必须用 background 指定 #RRGGBB 背景色，否则任务失败并退回全部次数。动图（GIF、APNG、动态
              WebP）暂不支持转换，只做保留动画的压缩。任务状态里的 target_format、output_format、quota_units 分别给出目标格式、实际产物格式与本次计次。
            </Prose>
            <CodeBlock label="转换示例">{convertSample(origin)}</CodeBlock>
            <Table label="格式支持">
              <thead>
                <tr>
                  <Th>格式</Th>
                  <Th>输入</Th>
                  <Th>转换目标</Th>
                  <Th>说明</Th>
                </tr>
              </thead>
              <tbody>
                {formatRows.map((row) => (
                  <tr key={row.format}>
                    <Td className="whitespace-nowrap font-mono">{row.format}</Td>
                    <Td className="whitespace-nowrap">{row.input}</Td>
                    <Td className="whitespace-nowrap">{row.output}</Td>
                    <Td className="text-ink-secondary">{row.note}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="quota" title="额度与错误">
            <Prose>每个响应都带三个额度头，只有真正产出更小文件才计一次，失败或产物不小于原图（保留原图）自动退回；格式转换额外计 1 次。</Prose>
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
            <Prose>
              走同一套 API 与额度。登录一次，Key 存在本机用户配置目录（macOS / Linux 为 ~/.config/lubanpng，Windows 为
              %APPDATA%\lubanpng）。
            </Prose>
            <CodeBlock label="安装（npm）">{CLI_INSTALL_COMMAND}</CodeBlock>
            <Prose>{CLI_PLATFORMS}</Prose>
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

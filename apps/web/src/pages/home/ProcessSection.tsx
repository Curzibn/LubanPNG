import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { cx } from "../../lib/cx.ts"

type Step = {
  format: string
  title: string
  body: string
  bodyMobile: string
  accent: boolean
}

const steps: Step[] = [
  {
    format: "PNG",
    title: "量化，再无损打磨",
    body: "先做调色板量化，再做无损重编码优化。量化过不了质量线时，自动改走纯无损路径。",
    bodyMobile: "量化过不了质量线时，自动改走纯无损路径。",
    accent: false,
  },
  {
    format: "JPEG",
    title: "先看原图质量，再决定下不下刀",
    body: "从量化表反推原图质量：低于 70 的图直接跳过，避免世代损失；重编码后用 SSIM 兜底，低于 0.90 自动提质重来。",
    bodyMobile: "低于 70 的图直接跳过，避免世代损失；SSIM 低于 0.90 自动提质重来。",
    accent: true,
  },
  {
    format: "GIF",
    title: "逐帧量化，动画照旧",
    body: "多帧共用一套调色板，只写入前后帧之间的差异区域；帧间隔与循环次数原样保留。",
    bodyMobile: "多帧共用调色板、只写差异区域，动画不丢。",
    accent: false,
  },
  {
    format: "WebP",
    title: "有损重编码，SSIM 兜底",
    body: "静态图用 libwebp 有损重编码，结构相似度低于 0.90 自动提质；无损源另比一版无损结果取更小者；动态 WebP 逐帧重编码。",
    bodyMobile: "有损重编码、SSIM 兜底，动图逐帧处理。",
    accent: false,
  },
  {
    format: "AVIF",
    title: "AV1 重编码",
    body: "dav1d 解码后用 rav1e 以速度档 8 重编码，同样以 SSIM 0.90 为质量底线。",
    bodyMobile: "AV1 重编码，SSIM 0.90 兜底。",
    accent: false,
  },
  {
    format: "转换",
    title: "转成 WebP / AVIF / PNG / JPEG",
    body: "静态图可转为四种目标格式之一，转换额外计 1 次；透明图转 JPEG 以白底填充。APNG 与动态 WebP 同样保留动画。",
    bodyMobile: "静态图可互转，额外计 1 次。",
    accent: true,
  },
]

export const ProcessSection = () => (
  <Container className="pt-12 md:pt-24">
    <section aria-labelledby="process-heading" className="flex flex-col gap-4 md:items-center md:gap-9">
      <div className="flex flex-col gap-3 md:items-center">
        <Eyebrow size="responsive">六道工序</Eyebrow>
        <h2 id="process-heading" className="hidden font-display text-display-md text-ink md:block">
          按格式各走一套刀法
        </h2>
      </div>
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        {steps.map((step) => (
          <article
            key={step.format}
            className={cx(
              "flex flex-col gap-1.5 border-t-rule bg-surface p-4.5 md:gap-3.5 md:p-7",
              step.accent ? "border-vermilion" : "border-ink",
            )}
          >
            <p className="font-mono text-label-sm font-semibold text-ink md:text-label">{step.format}</p>
            <h3 className="text-body-lg font-medium text-ink md:text-heading-sm">{step.title}</h3>
            <p className="text-ui leading-relaxed text-ink-secondary md:text-body">
              <span className="md:hidden">{step.bodyMobile}</span>
              <span className="hidden md:inline">{step.body}</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  </Container>
)

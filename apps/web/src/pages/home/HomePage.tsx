import { Link } from "react-router"
import { fetchCompressedBlob } from "../../api/client.ts"
import { usePageTitle } from "../../app/usePageTitle.ts"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { Notice } from "../../components/Notice.tsx"
import { downloadAllAsZip, openLinkInBrowser, saveBlobInBrowser } from "../../lib/download.ts"
import { useSession } from "../../session/sessionContext.ts"
import { downloadableItems } from "./compressorRules.ts"
import { Dropzone } from "./Dropzone.tsx"
import { IntegrationTeaser } from "./IntegrationTeaser.tsx"
import { OutputPicker } from "./OutputPicker.tsx"
import { ProcessSection } from "./ProcessSection.tsx"
import { QuotaChip } from "./QuotaChip.tsx"
import { ResultsBoard } from "./ResultsBoard.tsx"
import { useCompressor } from "./useCompressor.ts"

const Hero = () => (
  <section className="flex flex-col gap-3.5 pb-5 pt-9 md:items-center md:gap-5 md:pb-9 md:pt-18 md:text-center">
    <Eyebrow size="responsive">PNG · JPEG · GIF · WebP · AVIF 智能压缩</Eyebrow>
    <h1 className="max-w-prose font-display text-display-mobile text-balance text-ink md:text-display-hero">
      把图片刨薄，不伤画质。
    </h1>
    <p className="max-w-lede text-body text-pretty text-ink-secondary md:text-lede">
      <span className="md:hidden">量化与重编码把体积削掉一半以上，肉眼看不出差别，还能一键转 WebP / AVIF。</span>
      <span className="hidden md:inline">
        鲁班刨用调色板量化和重编码把体积削掉一半以上，肉眼看不出差别。JPEG 会先判断原图质量，低质量的图不再重复压缩；动图保留动画，静态图还能一键转成
        WebP / AVIF。
      </span>
    </p>
  </section>
)

const QuotaExhaustedNotice = ({ anonymous }: { anonymous: boolean }) => (
  <Notice tone="warning">
    {anonymous ? (
      <>
        今日免费次数已用完，
        <Link to="/login" className="text-vermilion hover:text-vermilion-hover">
          登录后每月 50 次
        </Link>
      </>
    ) : (
      "本月额度已用完，Pro 即将推出"
    )}
  </Notice>
)

export const HomePage = () => {
  usePageTitle()
  const { me } = useSession()
  const compressor = useCompressor()

  const handleDownloadAll = async () => {
    const items = downloadableItems(compressor.items)
    if (items.length === 0) return
    compressor.setDownloading(true)
    try {
      await downloadAllAsZip(items, {
        fetchBlob: fetchCompressedBlob,
        saveBlob: saveBlobInBrowser,
        openLink: openLinkInBrowser,
      })
    } finally {
      compressor.setDownloading(false)
    }
  }

  return (
    <>
      <Container>
        <Hero />
        <div className="mx-auto flex w-full max-w-board flex-col gap-5 md:gap-7">
          <Dropzone onFiles={compressor.addFiles} maxFileSize={me?.plan.max_file_size ?? null}>
            <QuotaChip />
          </Dropzone>
          <OutputPicker value={compressor.output} onChange={compressor.setOutput} />
          {compressor.quotaExhausted && <QuotaExhaustedNotice anonymous={me?.subject !== "account"} />}
          {compressor.batchNotice && <Notice tone="info" onDismiss={compressor.dismissNotices}>{compressor.batchNotice}</Notice>}
          {compressor.rejected.length > 0 && (
            <Notice tone="error" onDismiss={compressor.dismissNotices}>
              <p className="font-medium">以下文件未上传</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {compressor.rejected.map((file) => (
                  <li key={`${file.name}-${file.reason}`} className="flex min-w-0 gap-2">
                    <span className="truncate font-mono">{file.name}</span>
                    <span className="shrink-0 text-ink-secondary">{file.reason}</span>
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {compressor.items.length > 0 && (
            <ResultsBoard
              items={compressor.items}
              summary={compressor.summary}
              retentionHours={me?.plan.retention_hours ?? null}
              downloading={compressor.downloading}
              onDownloadAll={handleDownloadAll}
            />
          )}
        </div>
      </Container>
      <ProcessSection />
      <IntegrationTeaser />
    </>
  )
}

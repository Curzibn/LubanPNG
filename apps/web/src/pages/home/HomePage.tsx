import { Link } from "react-router"
import { fetchCompressedBlob } from "../../api/client.ts"
import { usePageMeta } from "../../app/usePageMeta.ts"
import { LinkButton } from "../../components/Button.tsx"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { Notice } from "../../components/Notice.tsx"
import { WaitlistButton } from "../../components/WaitlistButton.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { localizedPath } from "../../i18n/locale.ts"
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

const LedeText = ({ text, label, to }: { text: string; label: string; to: string }) => {
  const index = text.indexOf(label)
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <Link to={to} className="text-vermilion hover:text-vermilion-hover">
        {label}
      </Link>
      {text.slice(index + label.length)}
    </>
  )
}

const Hero = () => {
  const { locale, t } = useI18n()
  const upscaleHref = `${localizedPath("/developers", locale)}#upscale`
  return (
    <section className="flex flex-col gap-3.5 pb-5 pt-9 md:items-center md:gap-5 md:pb-9 md:pt-18 md:text-center">
      <Eyebrow size="responsive">{t("home.eyebrow")}</Eyebrow>
      <h1 className="max-w-prose font-display text-display-mobile text-balance text-ink md:text-display-hero">
        {t("home.title")}
      </h1>
      <p className="max-w-lede text-body text-pretty text-ink-secondary md:text-lede">
        <span className="md:hidden">
          <LedeText text={t("home.lede.mobile")} label={t("home.lede.apiLink")} to={upscaleHref} />
        </span>
        <span className="hidden md:inline">
          <LedeText text={t("home.lede.desktop")} label={t("home.lede.apiLink")} to={upscaleHref} />
        </span>
      </p>
    </section>
  )
}

const QuotaExhaustedNotice = ({ anonymous }: { anonymous: boolean }) => {
  const { locale, t } = useI18n()
  return (
    <Notice tone="warning">
      <p>{anonymous ? t("home.quota.anonymous.lead") : t("home.quota.account.lead")}</p>
      <p className="mt-1 text-ink-secondary">{anonymous ? t("home.quota.anonymous.body") : t("home.quota.account.body")}</p>
      <div className="mt-3">
        {anonymous ? (
          <LinkButton to={localizedPath("/login", locale)} variant="accent" size="md">
            {t("home.quota.anonymous.action")}
          </LinkButton>
        ) : (
          <WaitlistButton planId="pro" size="md" className="max-w-aside" />
        )}
      </div>
    </Notice>
  )
}

const LOW_QUOTA_THRESHOLD = 2

const LowQuotaNotice = ({ anonymous, remaining }: { anonymous: boolean; remaining: number }) => {
  const { locale, t } = useI18n()
  if (!anonymous) {
    return (
      <Notice tone="info">
        <p>{t("quota.low.account", { remaining, count: remaining })}</p>
      </Notice>
    )
  }
  return (
    <Notice tone="info">
      <p>
        {t("quota.low.anon", { remaining, count: remaining })}{" "}
        <Link to={localizedPath("/login", locale)} className="text-vermilion hover:text-vermilion-hover">
          {t("quota.low.anon.action")}
        </Link>
      </p>
    </Notice>
  )
}

export const HomePage = () => {
  usePageMeta("home")
  const { t } = useI18n()
  const { me } = useSession()
  const compressor = useCompressor()
  const anonymous = me?.subject !== "account"
  const remaining = me?.quota.remaining ?? null
  const exhausted = compressor.quotaExhausted || remaining === 0
  const lowQuota = !exhausted && remaining !== null && remaining <= LOW_QUOTA_THRESHOLD

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
          {exhausted ? (
            <QuotaExhaustedNotice anonymous={anonymous} />
          ) : (
            lowQuota && <LowQuotaNotice anonymous={anonymous} remaining={remaining} />
          )}
          {compressor.batchNotice && (
            <Notice tone="info" onDismiss={compressor.dismissNotices}>
              {compressor.batchNotice}
            </Notice>
          )}
          {compressor.rejected.length > 0 && (
            <Notice tone="error" onDismiss={compressor.dismissNotices}>
              <p className="font-medium">{t("home.rejected.title")}</p>
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

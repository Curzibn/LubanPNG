import { Button } from "../../components/Button.tsx"
import { DownloadIcon } from "../../components/icons.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { formatBytes, savingsPercent } from "../../lib/format.ts"
import type { BatchSummary, CompressionItem } from "./compressorRules.ts"
import { ResultRow } from "./ResultRow.tsx"

const Headline = ({ summary }: { summary: BatchSummary }) => {
  const { t } = useI18n()
  if (summary.completed > 0) {
    const percent = savingsPercent(summary.originalBytes, summary.compressedBytes)
    return (
      <p className="text-ui md:text-body">
        {t("results.batch", { count: summary.total })} ·{" "}
        <span className="md:hidden">{t("results.saved.mobile")}</span>
        <span className="hidden md:inline">{t("results.saved.desktop")}</span>{" "}
        <span className="font-mono font-semibold text-jade">{formatBytes(summary.savedBytes)}</span>
        <span className="hidden text-ink-secondary md:inline">{t("results.percent", { percent })}</span>
        {summary.quotaUnits > summary.completed && (
          <span className="text-ink-secondary"> · {t("results.conversions", { count: summary.quotaUnits })}</span>
        )}
      </p>
    )
  }
  return (
    <p className="text-ui md:text-body">
      {t("results.batch", { count: summary.total })} ·{" "}
      <span className="text-ink-secondary">{summary.inFlight ? t("results.inFlight") : t("results.noProducts")}</span>
    </p>
  )
}

export const ResultsBoard = ({
  items,
  summary,
  retentionHours,
  downloading,
  onDownloadAll,
}: {
  items: CompressionItem[]
  summary: BatchSummary
  retentionHours: number | null
  downloading: boolean
  onDownloadAll: () => void
}) => {
  const { t } = useI18n()
  const retention = retentionHours ?? 24
  const canDownload = items.some((item) => item.stage === "completed" && item.compressedUrl !== null)
  return (
    <section aria-label={t("results.aria")} className="flex flex-col gap-2.5 md:gap-0">
      <div className="flex flex-col gap-2.5 md:gap-0 md:overflow-hidden md:rounded-card md:border-thin md:border-hairline md:bg-surface">
        <div className="flex items-center justify-between gap-3 md:border-b-thin md:border-hairline md:bg-panel md:px-6 md:py-4.5">
          <Headline summary={summary} />
          <Button variant="accent" size="responsive" onClick={onDownloadAll} disabled={!canDownload || downloading}>
            <DownloadIcon className="size-4" strokeWidth={2} />
            {downloading ? t("results.zipping") : t("results.downloadAll")}
            <span className="hidden md:inline">.zip</span>
          </Button>
        </div>
        <ul className="flex flex-col gap-2.5 md:gap-0">
          {items.map((item) => (
            <ResultRow key={item.id} item={item} />
          ))}
        </ul>
      </div>
      <div className="hidden justify-between px-1 pt-3 text-label text-ink-secondary md:flex">
        <span>{t("results.note.left")}</span>
        <span>{t("results.note.right", { hours: retention })}</span>
      </div>
      <p className="text-label-sm text-ink-secondary md:hidden">
        {t("results.note.left.short")} · {t("results.note.right.short", { hours: retention })}
      </p>
    </section>
  )
}

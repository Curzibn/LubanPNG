import { Button } from "../../components/Button.tsx"
import { DownloadIcon } from "../../components/icons.tsx"
import { formatBytes, savingsPercent } from "../../lib/format.ts"
import type { BatchSummary, CompressionItem } from "./compressorRules.ts"
import { ResultRow } from "./ResultRow.tsx"

const Headline = ({ summary }: { summary: BatchSummary }) => {
  if (summary.completed > 0) {
    const percent = savingsPercent(summary.originalBytes, summary.compressedBytes)
    return (
      <p className="text-ui md:text-body">
        本次 {summary.total} 张 · <span className="hidden md:inline">共</span>节省{" "}
        <span className="font-mono font-semibold text-jade">{formatBytes(summary.savedBytes)}</span>
        <span className="hidden text-ink-secondary md:inline">（-{percent}%）</span>
        {summary.quotaUnits > summary.completed && (
          <span className="text-ink-secondary"> · 含转换计 {summary.quotaUnits} 次</span>
        )}
      </p>
    )
  }
  return (
    <p className="text-ui md:text-body">
      本次 {summary.total} 张 · <span className="text-ink-secondary">{summary.inFlight ? "压缩中…" : "没有可下载的产物"}</span>
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
  const retention = retentionHours ?? 24
  const canDownload = items.some((item) => item.stage === "completed" && item.compressedUrl !== null)
  return (
    <section aria-label="压缩结果" className="flex flex-col gap-2.5 md:gap-0">
      <div className="flex flex-col gap-2.5 md:gap-0 md:overflow-hidden md:rounded-card md:border-thin md:border-hairline md:bg-surface">
        <div className="flex items-center justify-between gap-3 md:border-b-thin md:border-hairline md:bg-panel md:px-6 md:py-4.5">
          <Headline summary={summary} />
          <Button variant="accent" size="responsive" onClick={onDownloadAll} disabled={!canDownload || downloading}>
            <DownloadIcon className="size-4" strokeWidth={2} />
            {downloading ? "打包中…" : "全部下载"}
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
        <span>压缩失败或没有变小的图片不计次数。</span>
        <span>产物保留 {retention} 小时后自动删除。</span>
      </div>
      <p className="text-label-sm text-ink-secondary md:hidden">失败或没变小不计次数 · 产物保留 {retention} 小时</p>
    </section>
  )
}

import { DownloadIcon } from "../../components/icons.tsx"
import { cx } from "../../lib/cx.ts"
import { compressedRatioPercent, formatBytes, formatSavings, formatSizePair, savingsPercent } from "../../lib/format.ts"
import { outputNameFor, targetLabel, type CompressionItem } from "./compressorRules.ts"

const pillClass =
  "inline-flex items-center whitespace-nowrap rounded-pill px-2.25 py-0.75 font-mono text-label-sm font-semibold md:px-2.5 md:py-1 md:text-label"

const StatusPill = ({ item }: { item: CompressionItem }) => {
  switch (item.stage) {
    case "completed":
      return (
        <span className={cx(pillClass, "bg-jade-soft text-jade")}>
          {item.compressedSize === null ? "完成" : formatSavings(savingsPercent(item.originalSize, item.compressedSize))}
        </span>
      )
    case "failed":
      return <span className={cx(pillClass, "bg-vermilion-soft text-vermilion")}>失败</span>
    case "uploading":
      return <span className={cx(pillClass, "text-ink-secondary")}>上传中 {Math.round(item.uploadRatio * 100)}%</span>
    case "queued":
      return (
        <span className={cx(pillClass, "text-ink-secondary")}>
          {item.queuePosition !== null && item.queuePosition > 0 ? `排队中 · 第 ${item.queuePosition} 位` : "排队中"}
        </span>
      )
    case "processing":
      return <span className={cx(pillClass, "text-ink-secondary")}>处理中</span>
    case "waiting":
      return <span className={cx(pillClass, "text-ink-secondary")}>等待上传</span>
  }
}

const Sizes = ({ item }: { item: CompressionItem }) => {
  if (item.stage === "failed") {
    return (
      <span className="truncate text-vermilion" title={item.error ?? undefined}>
        {item.error ?? "压缩失败"}
      </span>
    )
  }
  if (item.stage === "completed" && item.compressedSize !== null) {
    const pair = formatSizePair(item.originalSize, item.compressedSize)
    return (
      <span className="truncate">
        {pair.original} <span className="text-ink">→</span> <span className="font-semibold text-ink">{pair.compressed}</span>
      </span>
    )
  }
  return <span className="truncate">{formatBytes(item.originalSize)}</span>
}

const barFill = (item: CompressionItem): { className: string; width: number } => {
  switch (item.stage) {
    case "completed":
      return { className: "bg-jade", width: item.compressedSize === null ? 100 : compressedRatioPercent(item.originalSize, item.compressedSize) }
    case "uploading":
      return { className: "bg-ink", width: Math.round(item.uploadRatio * 100) }
    case "queued":
    case "processing":
      return { className: "animate-pulse bg-amber", width: 100 }
    case "failed":
      return { className: "bg-vermilion", width: 100 }
    case "waiting":
      return { className: "bg-hairline", width: 0 }
  }
}

export const ResultRow = ({ item }: { item: CompressionItem }) => {
  const fill = barFill(item)
  const downloadable = item.stage === "completed" && item.compressedUrl !== null
  return (
    <li className="grid grid-result-card items-center gap-2.5 rounded-tile border-thin border-hairline bg-surface p-3.5 md:grid-result-row md:gap-5 md:rounded-none md:border-x-0 md:border-t-0 md:px-6 md:py-4 md:last:border-b-0">
      <div className="area-thumb hidden size-12 items-end justify-center rounded-control bg-hairline md:flex" aria-hidden="true">
        <span className="pb-1 font-mono text-label-2xs text-ink">{item.format}</span>
      </div>
      <p className="area-name flex min-w-0 items-center gap-2 font-mono text-label text-ink md:text-ui" title={item.name}>
        <span className="min-w-0 truncate">{item.name}</span>
        {item.target && (
          <span className="shrink-0 rounded-mark bg-panel px-1.5 py-0.5 text-label-2xs font-semibold text-ink-secondary">
            → {targetLabel(item.target)}
          </span>
        )}
      </p>
      <p className="area-sizes flex min-w-0 font-mono text-label text-ink-secondary tabular-nums md:text-ui">
        <Sizes item={item} />
      </p>
      <div className="area-bars flex flex-col gap-1 md:gap-1.25" aria-hidden="true">
        <div className="h-1.25 rounded-bar bg-hairline md:h-1.5" />
        <div className={cx("h-1.25 rounded-bar transition-all md:h-1.5", fill.className)} style={{ width: `${fill.width}%` }} />
      </div>
      <div className="area-pill md:justify-self-end">
        <StatusPill item={item} />
      </div>
      {downloadable ? (
        <a
          href={item.compressedUrl ?? undefined}
          download={outputNameFor(item)}
          aria-label={`下载 ${outputNameFor(item)}`}
          className="area-download flex size-11 items-center justify-center justify-self-end rounded-control text-ink transition-colors hover:bg-panel"
        >
          <DownloadIcon className="size-5" />
        </a>
      ) : (
        <span className="area-download size-11 justify-self-end" aria-hidden="true" />
      )}
    </li>
  )
}

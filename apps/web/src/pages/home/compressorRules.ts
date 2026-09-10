import { tokens } from "@lubanpng/design-tokens/tokens"
import { formatBytes, outputFileName } from "../../lib/format.ts"

export const MAX_BATCH_FILES = 20
export const POLL_WAIT_SECONDS = 10
export const MAX_POLLS_PER_TASK = 90
export const CONVERSION_EXTRA_UNITS = 1
export const JPEG_FLATTEN_BACKGROUND = tokens.color.surface.toLowerCase()
export const FORMAT_LIST_LABEL = "PNG、JPEG、GIF、WebP、AVIF"
export const HEIC_HINT = "HEIC 暂不支持：iPhone 相册选图时 Safari 会自动转成 JPEG，其他设备请先导出为 JPEG"

const heicMimeTypes = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"])
const heicExtensions = new Set(["heic", "heif"])

export const isHeicFile = (name: string, mimeType: string): boolean => {
  if (heicMimeTypes.has(mimeType.toLowerCase())) return true
  const dot = name.lastIndexOf(".")
  return dot >= 0 && heicExtensions.has(name.slice(dot + 1).toLowerCase())
}

export type ImageFormat = "PNG" | "JPG" | "GIF" | "WEBP" | "AVIF"

export const ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"] as const

const mimeFormats: Record<string, ImageFormat> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
  "image/avif": "AVIF",
}

const extensionFormats: Record<string, ImageFormat> = {
  png: "PNG",
  jpg: "JPG",
  jpeg: "JPG",
  gif: "GIF",
  webp: "WEBP",
  avif: "AVIF",
}

export const detectFormat = (name: string, mimeType: string): ImageFormat | null => {
  const byMime = mimeFormats[mimeType.toLowerCase()]
  if (byMime) return byMime
  const dot = name.lastIndexOf(".")
  if (dot < 0) return null
  return extensionFormats[name.slice(dot + 1).toLowerCase()] ?? null
}

export type TargetFormat = "webp" | "avif" | "png" | "jpeg"
export type OutputChoice = "keep" | TargetFormat

export const OUTPUT_CHOICES: ReadonlyArray<{ value: OutputChoice; label: string }> = [
  { value: "keep", label: "保持原格式" },
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF" },
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
]

const nativeTarget: Record<ImageFormat, TargetFormat | null> = {
  PNG: "png",
  JPG: "jpeg",
  GIF: null,
  WEBP: "webp",
  AVIF: "avif",
}

export const effectiveTarget = (format: ImageFormat, choice: OutputChoice): TargetFormat | null => {
  if (choice === "keep") return null
  return nativeTarget[format] === choice ? null : choice
}

export const targetLabel = (target: TargetFormat): string => target.toUpperCase()

export type RejectedFile = { name: string; reason: string }

export type FileLike = { name: string; size: number; type: string }

export type Validation<T extends FileLike> = {
  accepted: T[]
  rejected: RejectedFile[]
  truncated: boolean
}

export const validateFiles = <T extends FileLike>(files: T[], maxFileSize: number | null): Validation<T> => {
  const accepted: T[] = []
  const rejected: RejectedFile[] = []
  for (const file of files) {
    if (detectFormat(file.name, file.type) === null) {
      rejected.push({ name: file.name, reason: isHeicFile(file.name, file.type) ? HEIC_HINT : `只支持 ${FORMAT_LIST_LABEL}` })
      continue
    }
    if (maxFileSize !== null && file.size > maxFileSize) {
      rejected.push({ name: file.name, reason: `超过 ${formatBytes(maxFileSize, { trim: true })} 上限` })
      continue
    }
    accepted.push(file)
  }
  const truncated = accepted.length > MAX_BATCH_FILES
  return { accepted: truncated ? accepted.slice(0, MAX_BATCH_FILES) : accepted, rejected, truncated }
}

export type CompressionStage = "waiting" | "uploading" | "queued" | "processing" | "completed" | "failed"

export type CompressionItem = {
  id: string
  name: string
  format: ImageFormat
  target: TargetFormat | null
  quotaUnits: number
  originalSize: number
  stage: CompressionStage
  uploadRatio: number
  queuePosition: number | null
  compressedSize: number | null
  compressedUrl: string | null
  error: string | null
}

export const outputNameFor = (item: Pick<CompressionItem, "name" | "target">): string =>
  outputFileName(item.name, item.target)

export const isInFlight = (stage: CompressionStage): boolean =>
  stage === "waiting" || stage === "uploading" || stage === "queued" || stage === "processing"

export type BatchSummary = {
  total: number
  completed: number
  originalBytes: number
  compressedBytes: number
  savedBytes: number
  quotaUnits: number
  inFlight: boolean
}

export const summarize = (items: CompressionItem[]): BatchSummary => {
  const done = items.filter((item) => item.stage === "completed" && item.compressedSize !== null)
  const originalBytes = done.reduce((sum, item) => sum + item.originalSize, 0)
  const compressedBytes = done.reduce((sum, item) => sum + (item.compressedSize ?? 0), 0)
  return {
    total: items.length,
    completed: done.length,
    originalBytes,
    compressedBytes,
    savedBytes: Math.max(0, originalBytes - compressedBytes),
    quotaUnits: done.reduce((sum, item) => sum + item.quotaUnits, 0),
    inFlight: items.some((item) => isInFlight(item.stage)),
  }
}

export const downloadableItems = (items: CompressionItem[]): Array<{ name: string; url: string }> =>
  items.flatMap((item) =>
    item.stage === "completed" && item.compressedUrl ? [{ name: outputNameFor(item), url: item.compressedUrl }] : [],
  )

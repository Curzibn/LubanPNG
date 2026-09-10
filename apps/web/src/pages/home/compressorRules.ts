import { formatBytes } from "../../lib/format.ts"

export const MAX_BATCH_FILES = 20
export const POLL_WAIT_SECONDS = 10
export const MAX_POLLS_PER_TASK = 90

export type ImageFormat = "PNG" | "JPG" | "GIF"

export const ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg", "image/gif"] as const

const mimeFormats: Record<string, ImageFormat> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/gif": "GIF",
}

const extensionFormats: Record<string, ImageFormat> = {
  png: "PNG",
  jpg: "JPG",
  jpeg: "JPG",
  gif: "GIF",
}

export const detectFormat = (name: string, mimeType: string): ImageFormat | null => {
  const byMime = mimeFormats[mimeType.toLowerCase()]
  if (byMime) return byMime
  const dot = name.lastIndexOf(".")
  if (dot < 0) return null
  return extensionFormats[name.slice(dot + 1).toLowerCase()] ?? null
}

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
      rejected.push({ name: file.name, reason: "只支持 PNG、JPEG、GIF" })
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
  originalSize: number
  stage: CompressionStage
  uploadRatio: number
  queuePosition: number | null
  compressedSize: number | null
  compressedUrl: string | null
  error: string | null
}

export const isInFlight = (stage: CompressionStage): boolean =>
  stage === "waiting" || stage === "uploading" || stage === "queued" || stage === "processing"

export type BatchSummary = {
  total: number
  completed: number
  originalBytes: number
  compressedBytes: number
  savedBytes: number
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
    inFlight: items.some((item) => isInFlight(item.stage)),
  }
}

export const downloadableItems = (items: CompressionItem[]): Array<{ name: string; url: string }> =>
  items.flatMap((item) =>
    item.stage === "completed" && item.compressedUrl ? [{ name: item.name, url: item.compressedUrl }] : [],
  )

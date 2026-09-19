import type { Locale } from "../i18n/locale.ts"

const KIB = 1024
const MIB = KIB * KIB

export type SizeUnit = "B" | "KB" | "MB"

export const unitFor = (bytes: number): SizeUnit => {
  if (bytes >= MIB) return "MB"
  if (bytes >= KIB) return "KB"
  return "B"
}

const trimTrailingZeros = (value: string): string => value.replace(/\.?0+$/, "")

export type FormatBytesOptions = { trim?: boolean }

export const formatBytesIn = (bytes: number, unit: SizeUnit, options: FormatBytesOptions = {}): string => {
  if (unit === "MB") {
    const fixed = (bytes / MIB).toFixed(2)
    return `${options.trim ? trimTrailingZeros(fixed) : fixed} MB`
  }
  if (unit === "KB") return `${Math.round(bytes / KIB)} KB`
  return `${Math.round(bytes)} B`
}

export const formatBytes = (bytes: number, options: FormatBytesOptions = {}): string =>
  formatBytesIn(bytes, unitFor(bytes), options)

export type SizePair = { original: string; compressed: string }

export const formatSizePair = (original: number, compressed: number): SizePair => {
  const unit = unitFor(original)
  return { original: formatBytesIn(original, unit), compressed: formatBytesIn(compressed, unit) }
}

export const savingsPercent = (original: number, compressed: number): number => {
  if (original <= 0) return 0
  return Math.max(0, Math.round((1 - compressed / original) * 100))
}

export const formatSavings = (percent: number): string => `-${percent}%`

export const compressedRatioPercent = (original: number, compressed: number): number => {
  if (original <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((compressed / original) * 100)))
}

const SHANGHAI = "Asia/Shanghai"

type DateParts = { year: string; month: string; day: string; hour: string; minute: string }

const partsIn = (date: Date, timeZone: string | undefined): DateParts => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const lookup = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: lookup.get("year") ?? "",
    month: lookup.get("month") ?? "",
    day: lookup.get("day") ?? "",
    hour: lookup.get("hour") ?? "",
    minute: lookup.get("minute") ?? "",
  }
}

const monthShortIn = (date: Date, timeZone: string | undefined): string =>
  new Intl.DateTimeFormat("en-US", { timeZone, month: "short" }).format(date)

const dayKey = (parts: DateParts): string => `${parts.year}-${parts.month}-${parts.day}`

export const formatResetTime = (iso: string, locale: Locale, timeZone: string = SHANGHAI): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const parts = partsIn(date, timeZone)
  if (locale === "en") return `${monthShortIn(date, timeZone)} ${Number(parts.day)}, ${parts.hour}:${parts.minute}`
  return `${Number(parts.month)} 月 ${Number(parts.day)} 日 ${parts.hour}:${parts.minute}`
}

export type RelativeTimeOptions = { now?: Date; timeZone?: string }

export const formatRelativeTime = (date: Date, locale: Locale, options: RelativeTimeOptions = {}): string => {
  if (Number.isNaN(date.getTime())) return ""
  const now = options.now ?? new Date()
  const parts = partsIn(date, options.timeZone)
  const today = dayKey(partsIn(now, options.timeZone))
  const yesterday = dayKey(partsIn(new Date(now.getTime() - 24 * 60 * 60 * 1000), options.timeZone))
  const key = dayKey(parts)
  const clock = `${parts.hour}:${parts.minute}`
  const sameDay = key === today ? "today" : key === yesterday ? "yesterday" : null
  if (locale === "en") {
    if (sameDay === "today") return `Today ${clock}`
    if (sameDay === "yesterday") return `Yesterday ${clock}`
    return `${monthShortIn(date, options.timeZone)} ${Number(parts.day)}, ${clock}`
  }
  if (sameDay === "today") return `今天 ${clock}`
  if (sameDay === "yesterday") return `昨天 ${clock}`
  return `${parts.month}-${parts.day} ${clock}`
}

export const formatUnixRelative = (unixSeconds: number, locale: Locale, options: RelativeTimeOptions = {}): string =>
  formatRelativeTime(new Date(unixSeconds * 1000), locale, options)

export const formatIsoRelative = (iso: string, locale: Locale, options: RelativeTimeOptions = {}): string =>
  formatRelativeTime(new Date(iso), locale, options)

export const formatShortDate = (iso: string, locale: Locale, timeZone?: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const parts = partsIn(date, timeZone)
  if (locale === "en") return `${monthShortIn(date, timeZone)} ${Number(parts.day)}`
  return `${parts.month}-${parts.day}`
}

export const maskedKey = (prefix: string, suffix: string): string => `${prefix}…${suffix}`

const outputExtensions: Record<string, string> = { png: "png", jpeg: "jpg", gif: "gif", webp: "webp", avif: "avif" }

const currentExtension = (name: string): string => {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

export const replaceExtension = (name: string, extension: string): string => {
  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${stem}.${extension}`
}

export const outputFileName = (originalName: string, outputFormat: string | null | undefined): string => {
  if (!outputFormat) return originalName
  const extension = outputExtensions[outputFormat]
  if (extension === undefined) return originalName
  const current = currentExtension(originalName)
  const sameFamily = current === extension || (extension === "jpg" && current === "jpeg")
  return sameFamily ? originalName : replaceExtension(originalName, extension)
}

import { translator, type Lang } from "./i18n/messages.js"

const KIB = 1024
const MIB = KIB * 1024
const GIB = MIB * 1024

export type SizeUnit = "B" | "KB" | "MB" | "GB"

export const unitFor = (bytes: number): SizeUnit => {
  const safe = Math.max(0, bytes)
  if (safe >= GIB) return "GB"
  if (safe >= MIB) return "MB"
  if (safe >= KIB) return "KB"
  return "B"
}

export const formatBytesIn = (bytes: number, unit: SizeUnit): string => {
  const safe = Math.max(0, bytes)
  if (unit === "B") return `${Math.round(safe)} B`
  const divisor = unit === "GB" ? GIB : unit === "MB" ? MIB : KIB
  const value = safe / divisor
  return `${value.toFixed(value < 10 ? 2 : 0)} ${unit}`
}

export const formatBytes = (bytes: number): string => formatBytesIn(bytes, unitFor(bytes))

export const formatSizePair = (
  original: number,
  compressed: number,
): { original: string; compressed: string } => {
  const unit = unitFor(original)
  return {
    original: formatBytesIn(original, unit),
    compressed: formatBytesIn(compressed, unit),
  }
}

export const savingsPercent = (original: number, compressed: number): number => {
  if (original <= 0) return 0
  return Math.max(0, Math.round((1 - compressed / original) * 100))
}

export const formatSavings = (percent: number): string => `-${percent}%`

const SHANGHAI = "Asia/Shanghai"

export const formatResetDate = (iso: string, lang: Lang): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const chinese = lang === "zh"
  const parts = new Intl.DateTimeFormat(chinese ? "zh-CN" : "en-US", {
    timeZone: SHANGHAI,
    month: chinese ? "numeric" : "short",
    day: "numeric",
  }).formatToParts(date)
  const month = parts.find((part) => part.type === "month")?.value ?? ""
  const day = parts.find((part) => part.type === "day")?.value ?? ""
  if (month === "" || day === "") return ""
  return translator(lang)("format.resetDate", {
    month: chinese ? Number(month) : month,
    day: Number(day),
  })
}

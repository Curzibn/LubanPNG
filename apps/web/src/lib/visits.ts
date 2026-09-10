import { reportVisit, type VisitPayload } from "../api/client.ts"

export const VISIT_WINDOW_MS = 30 * 60 * 1000
export const VISIT_STORAGE_KEY = "lubanpng:visit:last"

export type VisitLocation = { pathname: string; search: string }

export const referrerHost = (referrer: string): string => {
  if (referrer === "") return ""
  try {
    return new URL(referrer).host
  } catch {
    return ""
  }
}

const readUtm = (search: string, key: string): string | null => {
  const params = new URLSearchParams(search)
  const value = params.get(key)
  return value === null || value.trim() === "" ? null : value
}

export const buildVisitPayload = (location: VisitLocation, referrer: string): VisitPayload => ({
  path: location.pathname,
  referrer_host: referrerHost(referrer),
  utm_source: readUtm(location.search, "utm_source"),
  utm_medium: readUtm(location.search, "utm_medium"),
  utm_campaign: readUtm(location.search, "utm_campaign"),
})

export const shouldReportVisit = (
  lastReportedAt: number | null,
  now: number,
  windowMs: number = VISIT_WINDOW_MS,
): boolean =>
  lastReportedAt === null || Number.isNaN(lastReportedAt) || now - lastReportedAt >= windowMs

export type VisitDependencies = {
  now: () => number
  readLast: () => number | null
  writeLast: (timestamp: number) => void
  referrer: () => string
  send: (payload: VisitPayload) => Promise<void>
}

const readLastFromStorage = (): number | null => {
  try {
    const raw = window.localStorage.getItem(VISIT_STORAGE_KEY)
    if (raw === null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

const writeLastToStorage = (timestamp: number): void => {
  try {
    window.localStorage.setItem(VISIT_STORAGE_KEY, String(timestamp))
  } catch {
    return
  }
}

export const defaultVisitDependencies: VisitDependencies = {
  now: () => Date.now(),
  readLast: readLastFromStorage,
  writeLast: writeLastToStorage,
  referrer: () => document.referrer,
  send: reportVisit,
}

export const trackVisit = async (
  location: VisitLocation,
  dependencies: VisitDependencies = defaultVisitDependencies,
): Promise<void> => {
  const now = dependencies.now()
  if (!shouldReportVisit(dependencies.readLast(), now)) return
  dependencies.writeLast(now)
  try {
    await dependencies.send(buildVisitPayload(location, dependencies.referrer()))
  } catch {
    return
  }
}

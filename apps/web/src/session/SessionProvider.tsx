import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { fetchMe, logout, type Me, type QuotaHeaders } from "../api/client.ts"
import { SessionContext, type SessionStatus, type SessionValue } from "./sessionContext.ts"

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<SessionStatus>("loading")
  const [me, setMe] = useState<Me | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await fetchMe()
      setMe(result.data)
      setStatus("ready")
    } catch {
      setMe(null)
      setStatus("failed")
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchMe(controller.signal)
      .then((result) => {
        setMe(result.data)
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setMe(null)
        setStatus("failed")
      })
    return () => controller.abort()
  }, [])

  const applyQuota = useCallback((quota: QuotaHeaders) => {
    if (quota.remaining === null) return
    setMe((current) =>
      current
        ? {
            ...current,
            quota: {
              ...current.quota,
              remaining: quota.remaining ?? current.quota.remaining,
              limit: quota.limit ?? current.quota.limit,
              resets_at: quota.resetsAt ?? current.quota.resets_at,
            },
          }
        : current,
    )
  }, [])

  const signOut = useCallback(async () => {
    await logout()
    await refresh()
  }, [refresh])

  const value = useMemo<SessionValue>(
    () => ({ status, me, signedIn: me?.subject === "account", refresh, applyQuota, signOut }),
    [status, me, refresh, applyQuota, signOut],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}

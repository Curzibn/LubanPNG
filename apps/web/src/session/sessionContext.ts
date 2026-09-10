import { createContext, useContext } from "react"
import type { Me, QuotaHeaders } from "../api/client.ts"

export type SessionStatus = "loading" | "ready" | "failed"

export type SessionValue = {
  status: SessionStatus
  me: Me | null
  signedIn: boolean
  refresh: () => Promise<void>
  applyQuota: (quota: QuotaHeaders) => void
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

export const useSession = (): SessionValue => {
  const value = useContext(SessionContext)
  if (!value) throw new Error("useSession 必须在 SessionProvider 内使用")
  return value
}

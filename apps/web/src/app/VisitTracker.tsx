import { useEffect } from "react"
import { useLocation } from "react-router"
import { trackVisit } from "../lib/visits.ts"
import { useSession } from "../session/sessionContext.ts"

export const VisitTracker = () => {
  const location = useLocation()
  const { status } = useSession()
  useEffect(() => {
    if (status === "loading") return
    void trackVisit({ pathname: location.pathname, search: location.search })
  }, [status, location.pathname, location.search])
  return null
}

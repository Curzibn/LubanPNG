import { useEffect } from "react"
import { useLocation } from "react-router"
import { trackVisit } from "../lib/visits.ts"

export const VisitTracker = () => {
  const location = useLocation()
  useEffect(() => {
    void trackVisit({ pathname: location.pathname, search: location.search })
  }, [location.pathname, location.search])
  return null
}

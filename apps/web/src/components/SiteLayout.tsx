import { useEffect } from "react"
import { Outlet, useLocation } from "react-router"
import { SiteFooter } from "./SiteFooter.tsx"
import { SiteHeader } from "./SiteHeader.tsx"

const useScrollToDestination = () => {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 })
      return
    }
    const id = decodeURIComponent(hash.slice(1))
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname, hash])
}

export const SiteLayout = () => {
  useScrollToDestination()
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}

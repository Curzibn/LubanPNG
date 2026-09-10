import { useEffect } from "react"

const SITE_TITLE = "LubanPNG · 把图片刨薄，不伤画质"

export const usePageTitle = (title?: string): void => {
  useEffect(() => {
    document.title = title ? `${title} · LubanPNG` : SITE_TITLE
    return () => {
      document.title = SITE_TITLE
    }
  }, [title])
}

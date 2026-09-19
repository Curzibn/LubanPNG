import { useEffect } from "react"
import { useLocation } from "react-router"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { applyPageHead, buildPageHead, type RouteMetaId } from "../i18n/meta.ts"

export const usePageMeta = (id: RouteMetaId): void => {
  const { locale } = useI18n()
  const { pathname } = useLocation()
  useEffect(() => {
    applyPageHead(document, buildPageHead(id, locale, pathname))
  }, [id, locale, pathname])
}

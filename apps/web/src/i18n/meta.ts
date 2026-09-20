import { localizedPath, type Locale } from "./locale.ts"
import { messages } from "./messages.ts"

export const SITE_ORIGIN = "https://lubanpng.wizthink.cn"

export type PublicRouteId = "home" | "pricing" | "developers" | "terms" | "privacy"

export type RouteMetaId = PublicRouteId | "login" | "dashboard" | "notFound"

export const PUBLIC_ROUTE_IDS: readonly PublicRouteId[] = ["home", "pricing", "developers", "terms", "privacy"]

export const publicPaths: Record<PublicRouteId, string> = {
  home: "/",
  pricing: "/pricing",
  developers: "/developers",
  terms: "/terms",
  privacy: "/privacy",
}

const isPublicRoute = (id: RouteMetaId): id is PublicRouteId => Object.hasOwn(publicPaths, id)

export type MetaTag = { attr: "name" | "property"; key: string; content: string }

export type LinkTag = { rel: string; hreflang?: string; href: string }

export type PageHead = {
  lang: Locale
  title: string
  metas: MetaTag[]
  links: LinkTag[]
}

export const buildPageHead = (id: RouteMetaId, locale: Locale, pathname: string): PageHead => {
  const dictionary = messages[locale]
  const title = dictionary[`meta.${id}.title`]
  const description = dictionary[`meta.${id}.description`]
  const image = locale === "en" ? `${SITE_ORIGIN}/og-en.png` : `${SITE_ORIGIN}/og.png`
  const publicPath = isPublicRoute(id) ? publicPaths[id] : undefined
  const pageUrl = `${SITE_ORIGIN}${publicPath === undefined ? pathname : localizedPath(publicPath, locale)}`
  const metas: MetaTag[] = [
    { attr: "name", key: "description", content: description },
    { attr: "property", key: "og:type", content: "website" },
    { attr: "property", key: "og:site_name", content: "LubanPNG" },
    { attr: "property", key: "og:locale", content: locale === "en" ? "en_US" : "zh_CN" },
    { attr: "property", key: "og:locale:alternate", content: locale === "en" ? "zh_CN" : "en_US" },
    { attr: "property", key: "og:url", content: pageUrl },
    { attr: "property", key: "og:title", content: title },
    { attr: "property", key: "og:description", content: description },
    { attr: "property", key: "og:image", content: image },
    { attr: "property", key: "og:image:type", content: "image/png" },
    { attr: "property", key: "og:image:width", content: "1200" },
    { attr: "property", key: "og:image:height", content: "630" },
    { attr: "property", key: "og:image:alt", content: dictionary["meta.ogImageAlt"] },
    { attr: "name", key: "twitter:card", content: "summary_large_image" },
    { attr: "name", key: "twitter:title", content: title },
    { attr: "name", key: "twitter:description", content: description },
    { attr: "name", key: "twitter:image", content: image },
    { attr: "name", key: "twitter:image:alt", content: dictionary["meta.ogImageAlt"] },
  ]
  const links: LinkTag[] = []
  if (publicPath !== undefined) {
    const zhPath = localizedPath(publicPath, "zh-CN")
    const enPath = localizedPath(publicPath, "en")
    links.push(
      { rel: "canonical", href: `${SITE_ORIGIN}${localizedPath(publicPath, locale)}` },
      { rel: "alternate", hreflang: "zh-CN", href: `${SITE_ORIGIN}${zhPath}` },
      { rel: "alternate", hreflang: "en", href: `${SITE_ORIGIN}${enPath}` },
      { rel: "alternate", hreflang: "x-default", href: `${SITE_ORIGIN}${zhPath}` },
    )
  }
  return { lang: locale, title, metas, links }
}

export const applyPageHead = (doc: Document, head: PageHead): void => {
  doc.documentElement.lang = head.lang
  doc.title = head.title
  for (const link of doc.head.querySelectorAll('link[rel="canonical"], link[rel="alternate"]')) link.remove()
  for (const { attr, key, content } of head.metas) {
    const selector = `meta[${attr}="${key}"]`
    let element = doc.head.querySelector(selector)
    if (element === null) {
      element = doc.createElement("meta")
      element.setAttribute(attr, key)
      doc.head.append(element)
    }
    element.setAttribute("content", content)
  }
  for (const { rel, hreflang, href } of head.links) {
    const element = doc.createElement("link")
    element.setAttribute("rel", rel)
    if (hreflang !== undefined) element.setAttribute("hreflang", hreflang)
    element.setAttribute("href", href)
    doc.head.append(element)
  }
}

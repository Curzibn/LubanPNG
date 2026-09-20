import { LOCALES, localizedPath, type Locale } from "./locale.ts"
import { PUBLIC_ROUTE_IDS, buildPageHead, publicPaths, type PageHead, type PublicRouteId } from "./meta.ts"

export type ShellArtifact = {
  routeId: PublicRouteId
  locale: Locale
  fileName: string
  urlPath: string
  head: PageHead
  html: string
}

const SHELL_FOLDER: Record<Locale, string> = { "zh-CN": "zh", en: "en" }

const htmlEscape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const renderMeta = ({ attr, key, content }: PageHead["metas"][number]): string =>
  `    <meta ${attr}="${key}" content="${htmlEscape(content)}" />`

const renderLink = ({ rel, hreflang, href }: PageHead["links"][number]): string =>
  `    <link rel="${rel}"${hreflang === undefined ? "" : ` hreflang="${hreflang}"`} href="${htmlEscape(href)}" />`

const pageHeadPatterns = [
  /\s*<title>[\s\S]*?<\/title>/gi,
  /\s*<meta\s+(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*>/gi,
  /\s*<link\s+rel="(?:canonical|alternate)"[^>]*>/gi,
]

const withLang = (document: string, locale: Locale): string =>
  document.replace(/<html\b[^>]*>/i, (tag) =>
    /\slang="[^"]*"/i.test(tag) ? tag.replace(/\slang="[^"]*"/i, ` lang="${locale}"`) : `${tag.slice(0, -1)} lang="${locale}">`,
  )

export const shellFileName = (routeId: PublicRouteId, locale: Locale): string => `${SHELL_FOLDER[locale]}/${routeId}.html`

export const shellUrlPath = (routeId: PublicRouteId, locale: Locale): string =>
  localizedPath(publicPaths[routeId], locale)

export const renderShellDocument = (document: string, head: PageHead): string => {
  const stripped = pageHeadPatterns.reduce((html, pattern) => html.replace(pattern, ""), document)
  const block = [`    <title>${htmlEscape(head.title)}</title>`, ...head.metas.map(renderMeta), ...head.links.map(renderLink)]
  const withHead = stripped.replace(/\s*<\/head>/i, `\n${block.join("\n")}\n  </head>`)
  return withLang(withHead, head.lang)
}

export const publicRoutePaths: ReadonlyArray<{ routeId: PublicRouteId; locale: Locale; urlPath: string; fileName: string }> =
  LOCALES.flatMap((locale) =>
    PUBLIC_ROUTE_IDS.map((routeId) => ({
      routeId,
      locale,
      urlPath: shellUrlPath(routeId, locale),
      fileName: shellFileName(routeId, locale),
    })),
  )

export const buildShellArtifacts = (indexHtml: string): ShellArtifact[] =>
  publicRoutePaths.map(({ routeId, locale, urlPath, fileName }) => {
    const head = buildPageHead(routeId, locale, urlPath)
    return { routeId, locale, fileName, urlPath, head, html: renderShellDocument(indexHtml, head) }
  })

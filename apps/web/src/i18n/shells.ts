import { LOCALES, localizedPath, type Locale } from "./locale.ts"
import { PUBLIC_ROUTE_IDS, buildPageHead, publicPaths, type PageHead, type PublicRouteId } from "./meta.ts"
import {
  buildStaticContent,
  buildStructuredData,
  htmlEscape,
  renderJsonLd,
  type ShellRouteId,
} from "./prerender.ts"

export type ShellArtifact = {
  routeId: ShellRouteId
  locale: Locale
  fileName: string
  urlPath: string
  head: PageHead
  html: string
}

const SHELL_FOLDER: Record<Locale, string> = { "zh-CN": "zh", en: "en" }

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

export const notFoundShellFileName = (locale: Locale): string => `${SHELL_FOLDER[locale]}/not-found.html`

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

const ROOT_SLOT = '<div id="root"></div>'

export const injectStaticContent = (document: string, content: string): string => {
  if (!document.includes(ROOT_SLOT)) throw new Error("shell document is missing the #root slot")
  return document.replace(ROOT_SLOT, `<div data-static-content>\n${content}\n    </div>\n    ${ROOT_SLOT}`)
}

export const injectStructuredData = (document: string, script: string): string => {
  if (!document.includes("</body>")) throw new Error("shell document is missing the closing body tag")
  return document.replace("</body>", `  ${script}\n  </body>`)
}

const buildShellArtifact = (
  indexHtml: string,
  routeId: ShellRouteId,
  locale: Locale,
  urlPath: string,
  fileName: string,
): ShellArtifact => {
  const head = buildPageHead(routeId, locale, urlPath)
  let html = renderShellDocument(indexHtml, head)
  const content = buildStaticContent(routeId, locale)
  if (content !== "") html = injectStaticContent(html, content)
  const structuredData = buildStructuredData(routeId, locale)
  if (structuredData.length > 0) {
    html = injectStructuredData(html, structuredData.map(renderJsonLd).join("\n  "))
  }
  return { routeId, locale, fileName, urlPath, head, html }
}

export const buildShellArtifacts = (indexHtml: string): ShellArtifact[] => [
  ...publicRoutePaths.map(({ routeId, locale, urlPath, fileName }) =>
    buildShellArtifact(indexHtml, routeId, locale, urlPath, fileName),
  ),
  ...LOCALES.map((locale) =>
    buildShellArtifact(indexHtml, "notFound", locale, localizedPath("/", locale), notFoundShellFileName(locale)),
  ),
]

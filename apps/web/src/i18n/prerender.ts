import {
  agentChannelRows,
  cliRows,
  convertSample,
  developerFaqs,
  downloadSample,
  endpointRows,
  errorRows,
  formatRows,
  quotaHeadersSample,
  statusSample,
  upscaleLimitRows,
  upscaleSample,
  upscaleStatusSample,
  uploadSample,
} from "../lib/apiDocs.ts"
import { CLI_INSTALL_COMMAND } from "../lib/cliRelease.ts"
import { plans, pricingFaqs, type PlanCard } from "../lib/pricingData.ts"
import { GITHUB_URL } from "../lib/site.ts"
import { localizedPath, type Locale } from "./locale.ts"
import { SITE_ORIGIN, type PublicRouteId } from "./meta.ts"
import { messages, type MessageKey, type Messages } from "./messages.ts"

export type ShellRouteId = PublicRouteId | "notFound"

export type JsonLd = Record<string, unknown>

export const htmlEscape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const text = (dictionary: Messages, key: MessageKey): string => htmlEscape(dictionary[key])

const mono = (value: string): string => `<span class="font-mono">${htmlEscape(value)}</span>`

const codeBlock = (code: string): string =>
  `          <pre class="overflow-x-auto whitespace-pre-wrap rounded-card border-thin border-hairline bg-panel p-3.5 font-mono text-label-sm leading-prose text-ink"><code>${htmlEscape(code)}</code></pre>`

type NavLink = { labelKey: MessageKey; path: string }

const headerLinks: readonly NavLink[] = [
  { labelKey: "header.nav.pricing", path: "/pricing" },
  { labelKey: "header.nav.developers", path: "/developers" },
]

const footerLinks: readonly NavLink[] = [
  { labelKey: "footer.pricing", path: "/pricing" },
  { labelKey: "footer.developers", path: "/developers" },
  { labelKey: "footer.cli", path: "/developers#cli" },
  { labelKey: "footer.terms", path: "/terms" },
  { labelKey: "footer.privacy", path: "/privacy" },
]

const navLinks = (locale: Locale, dictionary: Messages, links: readonly NavLink[]): string =>
  links
    .map(
      ({ labelKey, path }) =>
        `            <a href="${localizedPath(path, locale)}">${text(dictionary, labelKey)}</a>`,
    )
    .join("\n")

const siteHeader = (locale: Locale, dictionary: Messages): string => `    <header class="px-5 md:px-10">
      <div class="mx-auto flex w-full max-w-page flex-wrap items-center justify-between gap-3 py-4">
        <a class="font-display text-ui font-medium text-ink" href="${localizedPath("/", locale)}">LubanPNG</a>
        <nav aria-label="${text(dictionary, "header.nav.aria")}" class="flex flex-wrap items-center gap-4 text-ui">
${navLinks(locale, dictionary, headerLinks)}
        </nav>
      </div>
    </header>`

const siteFooter = (locale: Locale, dictionary: Messages): string => `    <footer class="mt-12 border-t-thin border-hairline px-5 md:mt-24 md:px-10">
      <div class="mx-auto flex w-full max-w-page flex-col-reverse gap-2.5 py-6 text-label text-ink-secondary md:flex-row md:items-center md:justify-between md:text-ui">
        <a href="${GITHUB_URL}" rel="noreferrer">${text(dictionary, "footer.source")}</a>
        <nav aria-label="${text(dictionary, "footer.nav.aria")}" class="flex flex-wrap gap-x-4 gap-y-1">
${navLinks(locale, dictionary, footerLinks)}
        </nav>
      </div>
    </footer>`

const section = (id: string, title: string, body: string): string => `          <section id="${id}" class="flex flex-col gap-3.5">
            <h2 class="text-heading-sm font-medium text-ink md:text-heading">${title}</h2>
${body}
          </section>`

const tableHead = (label: string): string =>
  `                    <th class="border-t-thin border-hairline py-2.5 pr-4 text-left font-medium text-ink-secondary">${label}</th>`

const tableCell = (value: string): string =>
  `                    <td class="border-t-thin border-hairline py-2.5 pr-4 align-top">${value}</td>`

const dataTable = (headers: readonly string[], rows: readonly (readonly string[])[]): string => `            <div class="overflow-x-auto">
              <table class="w-full text-left text-ui">
                <thead>
                  <tr>
${headers.map(tableHead).join("\n")}
                  </tr>
                </thead>
                <tbody>
${rows
  .map((cells) => `                  <tr>\n${cells.map(tableCell).join("\n")}\n                  </tr>`)
  .join("\n")}
                </tbody>
              </table>
            </div>`

const homeMain = (locale: Locale, dictionary: Messages): string => `    <main class="px-5 md:px-10">
      <div class="mx-auto flex w-full max-w-page flex-col">
        <section class="flex flex-col gap-3.5 pb-5 pt-9 md:items-center md:gap-5 md:pb-9 md:pt-18 md:text-center">
          <p class="font-mono tracking-eyebrow text-label-sm text-ink-secondary">${text(dictionary, "home.eyebrow")}</p>
          <h1 class="max-w-prose font-display text-display-mobile text-balance text-ink md:text-display-hero">${text(dictionary, "home.title")}</h1>
          <p class="max-w-prose text-body text-pretty text-ink-secondary md:text-lede">${text(dictionary, "meta.home.description")}</p>
        </section>
        <section class="grid grid-cols-1 gap-4 pt-8 md:grid-cols-2 md:gap-6 md:pt-16">
          <section class="flex flex-col gap-4 rounded-card border-thin border-hairline bg-surface p-5 md:p-8">
            <h2 class="text-heading-sm font-medium text-ink md:text-heading">${text(dictionary, "teaser.api.title")}</h2>
${codeBlock(uploadSample(SITE_ORIGIN))}
            <p class="text-ui text-ink-secondary">${text(dictionary, "teaser.api.note")}</p>
            <p><a class="text-ui text-vermilion" href="${localizedPath("/developers", locale)}">${text(dictionary, "teaser.api.docs")}</a></p>
            <p><a class="text-ui text-vermilion" href="${localizedPath("/developers", locale)}#upscale">${text(dictionary, "teaser.api.upscale")}</a></p>
          </section>
          <section class="flex flex-col gap-4 rounded-card border-thin border-hairline bg-surface p-5 md:p-8">
            <h2 class="text-heading-sm font-medium text-ink md:text-heading">${text(dictionary, "teaser.cli.title")}</h2>
${codeBlock(CLI_INSTALL_COMMAND)}
            <p class="text-ui text-ink-secondary">${text(dictionary, "dev.cli.platforms")}</p>
${codeBlock(dictionary["teaser.cli.sample"])}
          </section>
        </section>
        <ul class="flex flex-col gap-2 pt-8 text-body text-ink-secondary md:pt-12">
          <li>${text(dictionary, "formats.list")}</li>
          <li>${text(dictionary, "home.quota.anonymous.body")}</li>
          <li>${text(dictionary, "dev.upscale.limits.scaleValue")}</li>
        </ul>
      </div>
    </main>`

const planCardHtml = (dictionary: Messages, plan: PlanCard): string => `          <article class="flex flex-col gap-5.5 rounded-card border-thin border-hairline bg-surface p-6 md:p-8">
            <div class="flex flex-col gap-2">
              <p class="font-mono tracking-eyebrow text-label text-ink-secondary">${text(dictionary, plan.eyebrowKey)}</p>
              <p class="font-display text-display-lg leading-none text-ink">${text(dictionary, plan.priceKey)}</p>
              <p class="text-ui text-ink-secondary">${text(dictionary, plan.descriptionKey)}</p>
            </div>
            <ul class="flex flex-col gap-3 text-body leading-normal text-ink">
${plan.featureKeys.map((key) => `              <li>${text(dictionary, key)}</li>`).join("\n")}
            </ul>
          </article>`

const pricingMain = (dictionary: Messages): string => `    <main class="px-5 md:px-10">
      <div class="mx-auto w-full max-w-page">
        <section class="flex flex-col gap-4 pb-8 pt-10 md:items-center md:pb-12 md:pt-18 md:text-center">
          <h1 class="font-display text-display-sm text-ink md:text-display-xl">${text(dictionary, "pricing.title")}</h1>
          <p class="max-w-lede-sm text-body text-pretty text-ink-secondary md:text-lede">${text(dictionary, "pricing.lede")}</p>
        </section>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch md:gap-6">
${plans.map((plan) => planCardHtml(dictionary, plan)).join("\n")}
        </div>
        <section aria-label="${text(dictionary, "pricing.faq.aria")}" class="grid grid-cols-1 gap-6 pt-12 md:grid-cols-3 md:pt-18">
${pricingFaqs
  .map(
    ({ questionKey, answerKey }) => `          <div class="flex flex-col gap-2 border-t-thin border-hairline pt-4.5">
            <h2 class="text-ui-lg font-medium text-ink">${text(dictionary, questionKey)}</h2>
            <p class="text-ui leading-prose text-ink-secondary">${text(dictionary, answerKey)}</p>
          </div>`,
  )
  .join("\n")}
        </section>
      </div>
    </main>`

const developersMain = (dictionary: Messages): string => {
  const steps: ReadonlyArray<{ labelKey: MessageKey; sample: string }> = [
    { labelKey: "dev.step1", sample: uploadSample(SITE_ORIGIN) },
    { labelKey: "dev.step2", sample: statusSample(SITE_ORIGIN) },
    { labelKey: "dev.step3", sample: downloadSample(SITE_ORIGIN) },
  ]
  return `    <main class="px-5 md:px-10">
      <div class="mx-auto w-full max-w-page pt-8 md:pt-14">
        <header class="flex flex-col gap-3.5">
          <h1 class="font-display text-display-sm text-ink md:text-display-lg">${text(dictionary, "dev.title")}</h1>
          <p class="max-w-prose text-body text-ink-secondary md:text-body-lg">${text(dictionary, "dev.intro")}</p>
        </header>
        <div class="flex max-w-prose flex-col gap-10 pt-8 md:gap-14">
${section(
    "auth",
    text(dictionary, "dev.section.auth"),
    `            <p class="text-body text-ink-secondary">${text(dictionary, "dev.auth.body")}</p>
${codeBlock("Authorization: Bearer lp_live_a8f3k2…")}`,
  )}
${section(
    "quickstart",
    text(dictionary, "dev.section.quickstart"),
    `            <ol class="flex list-decimal flex-col gap-3 pl-5 text-body text-ink">
${steps
  .map(
    ({ labelKey, sample }) => `              <li class="flex flex-col gap-3">
                <p>${text(dictionary, labelKey)}</p>
${codeBlock(sample)}
              </li>`,
  )
  .join("\n")}
            </ol>`,
  )}
${section(
    "endpoints",
    text(dictionary, "dev.section.endpoints"),
    dataTable(
      [text(dictionary, "dev.endpoints.method"), text(dictionary, "dev.endpoints.path"), text(dictionary, "dev.endpoints.auth")],
      endpointRows.map((row) => [
        mono(row.method),
        `${mono(row.path)} <span class="text-ink-secondary">· ${text(dictionary, row.purposeKey)}</span>`,
        `<span class="text-ink-secondary">${text(dictionary, row.authKey)}</span>`,
      ]),
    ),
  )}
${section(
    "convert",
    text(dictionary, "dev.section.convert"),
    `            <p class="text-body text-ink-secondary">${text(dictionary, "dev.convert.body")}</p>
${codeBlock(convertSample(SITE_ORIGIN))}
${dataTable(
  [text(dictionary, "dev.formats.format"), text(dictionary, "dev.formats.input"), text(dictionary, "dev.formats.output"), text(dictionary, "dev.formats.note")],
  formatRows.map((row) => [
    mono(row.format),
    text(dictionary, row.inputKey),
    text(dictionary, row.outputKey),
    `<span class="text-ink-secondary">${text(dictionary, row.noteKey)}</span>`,
  ]),
)}`,
  )}
${section(
    "upscale",
    text(dictionary, "dev.section.upscale"),
    `            <p class="text-body text-ink-secondary">${text(dictionary, "dev.upscale.body")}</p>
${codeBlock(upscaleSample(SITE_ORIGIN))}
${codeBlock(upscaleStatusSample(SITE_ORIGIN))}
${dataTable(
  [text(dictionary, "dev.upscale.limits.item"), text(dictionary, "dev.upscale.limits.value")],
  upscaleLimitRows.map((row) => [text(dictionary, row.itemKey), text(dictionary, row.valueKey)]),
)}
            <p class="text-body text-ink-secondary">${text(dictionary, "dev.upscale.queue")}</p>
            <p class="text-body text-ink-secondary">${text(dictionary, "dev.upscale.billing")}</p>`,
  )}
${section(
    "quota",
    text(dictionary, "dev.section.quota"),
    `            <p class="text-body text-ink-secondary">${text(dictionary, "dev.quota.body")}</p>
${codeBlock(quotaHeadersSample)}
${dataTable(
  ["HTTP", "code", text(dictionary, "dev.errors.meaning")],
  errorRows.map((row) => [mono(row.http), mono(row.code), text(dictionary, row.meaningKey)]),
)}`,
  )}
${section(
    "agents",
    text(dictionary, "dev.section.agents"),
    `            <p class="text-body text-ink-secondary">${text(dictionary, "dev.agents.body")}</p>
            <p><a class="text-ui text-vermilion" href="/llms.txt">${text(dictionary, "dev.agents.llms")}</a></p>
            <p><a class="text-ui text-vermilion" href="/api-doc/openapi.json">${text(dictionary, "dev.agents.openapi")}</a></p>
${dataTable(
  [text(dictionary, "dev.agents.channel"), text(dictionary, "dev.agents.status"), text(dictionary, "dev.agents.note")],
  agentChannelRows.map((row) => [
    mono(text(dictionary, row.channelKey)),
    `<span class="text-ink-secondary">${text(dictionary, row.statusKey)}</span>`,
    `<span class="text-ink-secondary">${text(dictionary, row.noteKey)}</span>`,
  ]),
)}`,
  )}
${section(
    "cli",
    text(dictionary, "dev.section.cli"),
    `            <p class="text-body text-ink-secondary">${text(dictionary, "dev.cli.body")}</p>
${codeBlock(CLI_INSTALL_COMMAND)}
            <p class="text-body text-ink-secondary">${text(dictionary, "dev.cli.platforms")}</p>
${codeBlock(dictionary["dev.cli.sample"])}
${dataTable(
  ["command", text(dictionary, "dev.errors.meaning")],
  cliRows.map((row) => [mono(row.command), `<span class="text-ink-secondary">${text(dictionary, row.meaningKey)}</span>`]),
)}`,
  )}
${section(
    "faq",
    text(dictionary, "dev.faq.title"),
    `            <div class="flex flex-col gap-4">
${developerFaqs
  .map(
    ({ questionKey, answerKey }) => `              <div class="flex flex-col gap-2 border-t-thin border-hairline pt-4.5">
                <h3 class="text-ui-lg font-medium text-ink">${text(dictionary, questionKey)}</h3>
                <p class="text-ui leading-prose text-ink-secondary">${text(dictionary, answerKey)}</p>
              </div>`,
  )
  .join("\n")}
            </div>`,
  )}
        </div>
      </div>
    </main>`
}

const notFoundMain = (locale: Locale, dictionary: Messages): string => `    <main class="px-5 md:px-10">
      <div class="mx-auto flex w-full max-w-page flex-col items-start gap-4 pt-16 md:pt-24">
        <p class="font-mono tracking-eyebrow text-label text-ink-secondary">404</p>
        <h1 class="font-display text-display-sm text-ink md:text-display-md">${text(dictionary, "nf.title")}</h1>
        <p class="text-body text-ink-secondary">${text(dictionary, "nf.body")}</p>
        <p><a class="text-ui text-vermilion" href="${localizedPath("/", locale)}">${text(dictionary, "nf.back")}</a></p>
      </div>
    </main>`

const routeMain = (routeId: ShellRouteId, locale: Locale, dictionary: Messages): string | null => {
  switch (routeId) {
    case "home":
      return homeMain(locale, dictionary)
    case "pricing":
      return pricingMain(dictionary)
    case "developers":
      return developersMain(dictionary)
    case "notFound":
      return notFoundMain(locale, dictionary)
    case "terms":
    case "privacy":
      return null
  }
}

export const buildStaticContent = (routeId: ShellRouteId, locale: Locale): string => {
  const dictionary = messages[locale]
  const main = routeMain(routeId, locale, dictionary)
  if (main === null) return ""
  return [siteHeader(locale, dictionary), main, siteFooter(locale, dictionary)].join("\n")
}

const faqPage = (
  locale: Locale,
  dictionary: Messages,
  faqs: ReadonlyArray<{ questionKey: MessageKey; answerKey: MessageKey }>,
): JsonLd => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  inLanguage: locale,
  mainEntity: faqs.map(({ questionKey, answerKey }) => ({
    "@type": "Question",
    name: dictionary[questionKey],
    acceptedAnswer: { "@type": "Answer", text: dictionary[answerKey] },
  })),
})

export const buildStructuredData = (routeId: ShellRouteId, locale: Locale): JsonLd[] => {
  const dictionary = messages[locale]
  switch (routeId) {
    case "home":
      return [
        {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "LubanPNG",
          url: `${SITE_ORIGIN}${localizedPath("/", locale)}`,
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Web",
          description: dictionary["meta.home.description"],
          inLanguage: locale,
          featureList: [
            dictionary["formats.list"],
            dictionary["dev.section.convert"],
            dictionary["dev.section.upscale"],
            dictionary["dev.section.cli"],
          ],
          offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
        },
      ]
    case "pricing":
      return [faqPage(locale, dictionary, pricingFaqs)]
    case "developers":
      return [
        {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: `${dictionary["dev.title"]} · ${dictionary["dev.section.quickstart"]}`,
          description: dictionary["dev.intro"],
          inLanguage: locale,
          step: [
            { "@type": "HowToStep", name: dictionary["dev.step1"], text: dictionary["dev.step1"] },
            { "@type": "HowToStep", name: dictionary["dev.step2"], text: dictionary["dev.step2"] },
            { "@type": "HowToStep", name: dictionary["dev.step3"], text: dictionary["dev.step3"] },
          ],
        },
        faqPage(locale, dictionary, developerFaqs),
      ]
    case "notFound":
    case "terms":
    case "privacy":
      return []
  }
}

export const renderJsonLd = (data: JsonLd): string =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`

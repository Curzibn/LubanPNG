import { en } from "./locales/en.js"
import { zh } from "./locales/zh.js"

export type Lang = "zh" | "en"

export type Messages = typeof zh
export type MessageKey = keyof Messages
export type MessageParams = Record<string, string | number>
export type Translate = (key: MessageKey, params?: MessageParams) => string

export const DEFAULT_LANG: Lang = "en"
export const LANG_ENV_VARS = ["LC_ALL", "LANG"] as const
export const LANG_TAGS: Record<Lang, string> = { zh: "zh-CN", en: "en" }

export const messages: Record<Lang, Messages> = { zh, en }

const englishPlural = new Intl.PluralRules("en")

const hasKey = (dictionary: Messages, key: string): key is MessageKey => Object.hasOwn(dictionary, key)

export const hasMessage = (lang: Lang, key: string): key is MessageKey => hasKey(messages[lang], key)

export const translate = (dictionary: Messages, key: MessageKey, params: MessageParams = {}): string => {
  let template: string = dictionary[key]
  const count = params.count
  if (typeof count === "number") {
    const suffix = englishPlural.select(count) === "one" ? "one" : "other"
    const pluralKey = `${key}.${suffix}`
    if (hasKey(dictionary, pluralKey)) template = dictionary[pluralKey]
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  )
}

export const translator =
  (lang: Lang): Translate =>
  (key, params) =>
    translate(messages[lang], key, params)

export const normalizeLang = (raw: string | null | undefined): Lang | null => {
  const value = raw?.trim().toLowerCase() ?? ""
  if (value === "") return null
  return value.startsWith("zh") ? "zh" : "en"
}

const explicitLang = (argv: string[]): string | null => {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string
    if (token === "--") return null
    if (token === "--lang") return (argv[index + 1] as string | undefined) ?? null
    if (token.startsWith("--lang=")) return token.slice("--lang=".length)
  }
  return null
}

export const resolveLang = (argv: string[] = [], env: NodeJS.ProcessEnv = process.env): Lang => {
  const flagged = normalizeLang(explicitLang(argv))
  if (flagged !== null) return flagged
  for (const name of LANG_ENV_VARS) {
    const fromEnv = normalizeLang(env[name])
    if (fromEnv !== null) return fromEnv
  }
  return DEFAULT_LANG
}

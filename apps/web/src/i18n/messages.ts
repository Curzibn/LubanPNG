import { en } from "./locales/en.ts"
import { zhCN } from "./locales/zh-CN.ts"
import { requestLocale } from "./locale.ts"

export const messages = { "zh-CN": zhCN, en }

export type Messages = typeof zhCN
export type MessageKey = keyof Messages
export type MessageParams = Record<string, string | number>

const englishPlural = new Intl.PluralRules("en")

const hasKey = (dictionary: Messages, key: string): key is MessageKey => Object.hasOwn(dictionary, key)

export const translate = (dictionary: Messages, key: MessageKey, params: MessageParams = {}): string => {
  let template = dictionary[key]
  const count = params.count
  if (typeof count === "number") {
    const suffix = englishPlural.select(count) === "one" ? "one" : "other"
    const pluralKey: string = `${key}.${suffix}`
    if (hasKey(dictionary, pluralKey)) template = dictionary[pluralKey]
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : whole))
}

export const translateCurrent = (key: MessageKey, params?: MessageParams): string =>
  translate(messages[requestLocale()], key, params)
